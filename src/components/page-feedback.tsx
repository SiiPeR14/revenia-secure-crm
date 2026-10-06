export function PageFeedback({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return <div className={`page-feedback ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error ?? success}</div>;
}
