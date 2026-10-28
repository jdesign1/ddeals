import { LoaderCircle } from "lucide-react";

export default function ButtonSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return <LoaderCircle className={`${className} shrink-0 animate-spin motion-reduce:animate-none`} aria-hidden="true" />;
}
