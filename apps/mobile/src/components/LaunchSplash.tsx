"use client";

import { useEffect, useState } from "react";

const SPLASH_DURATION_MS = 4_800;
const SPLASH_EXIT_MS = 260;

/**
 * One-time startup splash for the native shell and the web app. The iOS
 * launch storyboard is intentionally only a plain colour; this is the first
 * branded surface shown once the WebView has loaded.
 */
export default function LaunchSplash() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => setExiting(true),
      reducedMotion ? 300 : SPLASH_DURATION_MS
    );
    const removeTimer = window.setTimeout(
      () => setVisible(false),
      reducedMotion ? 560 : SPLASH_DURATION_MS + SPLASH_EXIT_MS
    );

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`launch-splash${exiting ? " launch-splash--exit" : ""}`}
      aria-hidden="true"
    >
      <div className="launch-splash__mascot">
        <svg className="launch-splash__mark" viewBox="0 0 512 512">
          <path className="mark-fill" d="M 284.38 31 L 295 31.71 L 309 36.84 L 320 44.55 L 331.33 57 L 342.38 74 L 354.03 96 L 371.35 134 L 377.2 148 L 377.06 150 L 313 167.31 L 247 182.15 L 159 198.21 L 98.86 207 L 100.85 157 L 103.67 127 L 105.8 114 L 108.65 102 L 112.64 91 L 117.69 82 L 125.45 73 L 135 65.98 L 142 62.82 L 151 60.68 L 167 60.83 L 195 66.5 L 204 66.91 L 214 65.47 L 227 59.33 L 248 44.73 L 262 36.86 L 273 32.83 L 284.38 31 Z" />
          <path className="mark-fill" d="M 437.85 152 L 444 151.85 L 452 153.81 L 454.27 156 L 454.41 160 L 450.6 165 L 444 170.19 L 422 182.43 L 377 202.31 L 334 218.27 L 288 232.4 L 254 241.14 L 222 248.19 L 183 255.28 L 152 259.3 L 109 262.29 L 74 262.2 L 52 260.23 L 39 257.26 L 34 255.21 L 29.32 252 L 27.51 249 L 28.72 244 L 35.14 239 L 45 234.79 L 59 230.81 L 90 224.72 L 175 212.26 L 248 198.32 L 325 180.42 L 412 156.7 L 437.85 152 Z" />
          <path className="mark-fill" d="M 393.95 208 L 399 207.6 L 404 208.77 L 414 212.78 L 423 217.67 L 439.4 230 L 455.3 247 L 465.23 262 L 474.23 281 L 480.19 301 L 483.17 319 L 483.69 341 L 482.2 361 L 476.36 387 L 470.3 403 L 460.18 422 L 448.39 438 L 436.76 450 L 421 462.24 L 411 467.98 L 399 473.35 L 387 477.1 L 376 479.3 L 356 480.25 L 335 477.18 L 323 473.36 L 311 468.02 L 292 456.22 L 280.04 446 L 273 438.61 L 260 421 L 247.35 438 L 236.8 449 L 223 460.13 L 211 467.28 L 197 473.31 L 182 477.35 L 165 478.94 L 149 478.2 L 135 475.34 L 123 471.22 L 112 466.07 L 99 458.13 L 90 451.21 L 79.01 441 L 67.72 428 L 60.72 418 L 51.67 401 L 44.85 382 L 40.88 361 L 40.08 344 L 41.67 323 L 45.72 305 L 51.76 289 L 60 274.91 L 90 276.51 L 129 275.31 L 169 271.33 L 224 262.27 L 274 250.37 L 311 239.44 L 348 226.47 L 393.95 208 Z" />
          <path className="eye-fill" d="M 356.18 257 L 370 257.77 L 387 262.54 L 402 270.65 L 415 281.7 L 424.47 294 L 431.27 307 L 436.24 323 L 438.13 339 L 437.4 354 L 432.33 374 L 424.29 390 L 417.45 399 L 404 411.26 L 392 418.38 L 378 423.33 L 365 425.46 L 348 425.31 L 334 422.44 L 319 416.02 L 306 407.28 L 292.64 393 L 284.5 379 L 279.57 365 L 276.81 347 L 277.64 329 L 281.62 313 L 288.61 298 L 299.73 283 L 313 271.52 L 329 262.74 L 342 258.67 L 356.18 257 Z" />
          <path className="eye-fill" d="M 153.31 288 L 167 287.86 L 193 290.81 L 208 294.57 L 221 299.89 L 229.27 305 L 234.48 316 L 238.32 329 L 239.57 344 L 238.3 360 L 234.37 374 L 226.34 390 L 216 402.71 L 203 413.34 L 188 420.5 L 177 423.27 L 161 424.4 L 146 422.41 L 129 416.14 L 118 409.3 L 107.8 400 L 98.68 388 L 91.61 373 L 87.78 358 L 86.93 343 L 88.67 328 L 92.65 315 L 99.48 303 L 108 297.72 L 121 292.77 L 136 289.58 L 153.31 288 Z" />
          <g className="launch-splash__pupil launch-splash__pupil--right">
            <path className="pupil-fill" d="M 397.35 317 L 406 316.07 L 416 317.86 L 423 321.97 L 427.28 327 L 427 327.87 L 420 327.59 L 415 329.58 L 411 333.16 L 408.53 338 L 408.57 346 L 412 352.22 L 416 355.16 L 420 356.32 L 424 356.25 L 428 354.89 L 428.55 356 L 428.34 360 L 425.35 370 L 421.31 378 L 419 380.39 L 409 376.75 L 398 374.65 L 386 374.55 L 377 375.76 L 371.65 367 L 369.68 359 L 369.58 351 L 370.66 344 L 373.73 336 L 376.77 331 L 383.52 324 L 390 319.66 L 397.35 317 Z" />
          </g>
          <g className="launch-splash__pupil launch-splash__pupil--left">
            <path className="pupil-fill" d="M 201 319 L 210 318.65 L 216 319.87 L 222 322.84 L 228.27 329 L 228 330.33 L 220 330.47 L 215.22 333 L 211.49 337 L 209.5 342 L 210.53 350 L 216 356.35 L 222 358.4 L 229 357.34 L 230.28 358 L 227.4 371 L 221 382.13 L 210 378.55 L 199 376.64 L 178 377.56 L 172.61 368 L 170.79 360 L 170.87 352 L 171.69 347 L 175.69 337 L 180 331.09 L 187 324.76 L 192 321.8 L 201 319 Z" />
          </g>
        </svg>
        <span className="launch-splash__wink-mask" />
        <svg className="launch-splash__wink-line" viewBox="0 0 38 20">
          <path d="M 3 11 Q 19 4 35 11" />
        </svg>
      </div>
    </div>
  );
}
