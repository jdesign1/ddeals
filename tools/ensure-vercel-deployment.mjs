const API_BASE_URL = "https://api.vercel.com";
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 90_000;
const DEFAULT_BUILD_TIMEOUT_MS = 300_000;

const TERMINAL_STATES = new Set(["READY", "ERROR", "CANCELED", "BLOCKED"]);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function shortSha(sha) {
  return sha.slice(0, 12);
}

function deploymentState(deployment) {
  return deployment?.readyState ?? deployment?.state ?? "UNKNOWN";
}

function deploymentError(deployment) {
  const error = deployment?.error ?? deployment?.aliasError;
  if (!error) return "no build error details were returned";
  if (typeof error === "string") return error;
  return error.message ?? error.code ?? "no build error details were returned";
}

function productionAliasReady(deployment) {
  if (deployment?.target !== "production") return true;
  if (deployment.aliasError) return false;
  return deployment.aliasAssigned !== false;
}

function deploymentComplete(deployment) {
  const state = deploymentState(deployment);
  if (!TERMINAL_STATES.has(state)) return false;
  return state !== "READY" || productionAliasReady(deployment);
}

function apiErrorMessage(payload, status) {
  const error = payload?.error ?? payload;
  const message =
    (typeof error === "string" ? error : error?.message) ??
    (typeof payload?.message === "string" ? payload.message : null) ??
    `HTTP ${status}`;

  return String(message).replace(/\s+/g, " ").slice(0, 500);
}

async function requestJson(path, options = {}) {
  const token = requiredEnv("VERCEL_TOKEN");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(`Vercel API request failed: ${apiErrorMessage(payload, response.status)}`);
  }

  return payload;
}

function deploymentMatchesSha(deployment, sha) {
  return (
    deployment?.meta?.githubCommitSha === sha ||
    deployment?.gitSource?.sha === sha ||
    deployment?.sha === sha
  );
}

async function findProductionDeployment(sha) {
  const projectId = requiredEnv("VERCEL_PROJECT_ID");
  const teamId = requiredEnv("VERCEL_ORG_ID");
  const ref = requiredEnv("VERCEL_GIT_REF");
  const params = new URLSearchParams({
    projectId,
    teamId,
    target: "production",
    branch: ref,
    sha,
    limit: "100",
  });
  const payload = await requestJson(`/v7/deployments?${params}`);
  const deployments = Array.isArray(payload?.deployments) ? payload.deployments : [];
  const matches = deployments.filter((deployment) => deploymentMatchesSha(deployment, sha));
  const statePriority = {
    READY: 3,
    BUILDING: 2,
    INITIALIZING: 2,
    QUEUED: 2,
    ERROR: 1,
    CANCELED: 1,
  };

  matches.sort((left, right) => {
    const priorityDifference =
      (statePriority[deploymentState(right)] ?? 0) -
      (statePriority[deploymentState(left)] ?? 0);
    if (priorityDifference !== 0) return priorityDifference;
    return (right.createdAt ?? 0) - (left.createdAt ?? 0);
  });

  return matches[0] ?? null;
}

async function getDeployment(deploymentId) {
  const teamId = requiredEnv("VERCEL_ORG_ID");
  const payload = await requestJson(
    `/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(teamId)}`,
  );
  return payload?.deployment ?? payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProductionDeployment(sha, timeoutMs) {
  const intervalMs = numberEnv("VERCEL_DEPLOYMENT_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const deployment = await findProductionDeployment(sha);
    if (deployment) {
      const state = deploymentState(deployment);
      console.log(`Found Vercel deployment ${deployment.id} for ${shortSha(sha)} (${state}).`);

      if (state !== "READY" && TERMINAL_STATES.has(state)) return deployment;
      if (state === "READY" && productionAliasReady(deployment)) return deployment;

      return waitForDeploymentState(deployment.id, timeoutMs);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    console.log(`No Vercel deployment for ${shortSha(sha)} yet; checking again soon.`);
    await sleep(Math.min(intervalMs, remainingMs));
  }

  return null;
}

async function waitForDeploymentState(deploymentId, timeoutMs) {
  const intervalMs = numberEnv("VERCEL_DEPLOYMENT_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  let deployment = await getDeployment(deploymentId);

  while (!deploymentComplete(deployment) && Date.now() <= deadline) {
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    deployment = await getDeployment(deploymentId);
  }

  return deployment;
}

async function createFallbackDeployment(sha) {
  const projectId = requiredEnv("VERCEL_PROJECT_ID");
  const teamId = requiredEnv("VERCEL_ORG_ID");
  const repository = requiredEnv("VERCEL_REPOSITORY");
  const ref = requiredEnv("VERCEL_GIT_REF");
  const [org, repo] = repository.split("/");

  if (!org || !repo || repository.split("/").length !== 2) {
    throw new Error("VERCEL_REPOSITORY must be in the form owner/repository");
  }

  const payload = await requestJson(`/v13/deployments?teamId=${encodeURIComponent(teamId)}`, {
    method: "POST",
    body: JSON.stringify({
      name: process.env.VERCEL_PROJECT_NAME?.trim() || repo,
      project: projectId,
      target: "production",
      gitSource: {
        type: "github",
        org,
        repo,
        ref,
        sha,
      },
    }),
  });

  const deployment = payload?.deployment ?? payload;
  if (!deployment?.id) {
    throw new Error("Vercel did not return a deployment ID for the fallback deployment");
  }

  console.log(`Created fallback Vercel deployment ${deployment.id} for ${shortSha(sha)}.`);
  return deployment;
}

async function currentMainSha() {
  const repository = requiredEnv("VERCEL_REPOSITORY");
  const githubToken = requiredEnv("GITHUB_TOKEN");
  const response = await fetch(
    `https://api.github.com/repos/${repository}/commits/main`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "User-Agent": "dodgey-deals-vercel-deployment-guard",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok || typeof payload?.sha !== "string") {
    throw new Error(`GitHub main-branch lookup failed: ${apiErrorMessage(payload, response.status)}`);
  }

  return payload.sha;
}

async function ensureDeployment() {
  requiredEnv("VERCEL_TOKEN");
  requiredEnv("VERCEL_PROJECT_ID");
  requiredEnv("VERCEL_ORG_ID");

  const sha = requiredEnv("VERCEL_TARGET_SHA");
  const ref = requiredEnv("VERCEL_GIT_REF");
  const discoveryTimeoutMs = numberEnv(
    "VERCEL_DISCOVERY_TIMEOUT_MS",
    DEFAULT_DISCOVERY_TIMEOUT_MS,
  );
  const buildTimeoutMs = numberEnv("VERCEL_BUILD_TIMEOUT_MS", DEFAULT_BUILD_TIMEOUT_MS);

  if (ref !== "main") {
    throw new Error(`Vercel deployment guard only permits the main branch (received ${ref})`);
  }

  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error("VERCEL_TARGET_SHA must be a full 40-character commit SHA");
  }

  console.log(`Checking for a production deployment of ${shortSha(sha)} from ${ref}.`);
  let deployment = await waitForProductionDeployment(sha, discoveryTimeoutMs);
  let fallbackCreated = false;

  if (!deployment) {
    const latestMainSha = await currentMainSha();
    if (latestMainSha !== sha) {
      console.log(
        `Skipping fallback for stale commit ${shortSha(sha)}; main is now ${shortSha(latestMainSha)}.`,
      );
      return;
    }

    console.log(`Vercel did not create a deployment for ${shortSha(sha)}; creating a fallback.`);

    // Recheck immediately before creating a deployment to avoid racing the Git integration.
    deployment = await findProductionDeployment(sha);
    if (!deployment) {
      const latestMainShaBeforeCreate = await currentMainSha();
      if (latestMainShaBeforeCreate !== sha) {
        console.log(
          `Skipping fallback for stale commit ${shortSha(sha)}; main is now ${shortSha(latestMainShaBeforeCreate)}.`,
        );
        return;
      }
      deployment = await createFallbackDeployment(sha);
      fallbackCreated = true;
    }
  }

  const state = deploymentState(deployment);
  if (!TERMINAL_STATES.has(state)) {
    deployment = await waitForDeploymentState(deployment.id, buildTimeoutMs);
  }

  const finalState = deploymentState(deployment);
  if (finalState !== "READY") {
    throw new Error(
      `Vercel deployment ${deployment.id} for ${shortSha(sha)} ended in ${finalState}: ${deploymentError(deployment)}`,
    );
  }

  if (!productionAliasReady(deployment)) {
    throw new Error(
      `Vercel deployment ${deployment.id} is READY but its production alias was not assigned: ${deploymentError(deployment)}`,
    );
  }

  if (fallbackCreated) {
    const latestMainShaAfterDeployment = await currentMainSha();
    if (latestMainShaAfterDeployment !== sha) {
      console.log(
        `Fallback deployment completed after main advanced to ${shortSha(latestMainShaAfterDeployment)}; the newer guard run owns production.`,
      );
      return;
    }
  }

  console.log(`Vercel deployment ${deployment.id} is READY for ${shortSha(sha)}.`);
}

ensureDeployment().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
