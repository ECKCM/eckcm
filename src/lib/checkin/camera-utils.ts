/**
 * Request camera access explicitly via getUserMedia.
 * Returns true if permission was granted, false if denied.
 * The stream is immediately released — Scanner creates its own.
 */
export async function requestCameraAccess(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if camera permission is permanently denied via Permissions API.
 * Returns 'denied' | 'granted' | 'prompt' | 'unknown'
 */
export async function getCameraPermissionState(): Promise<
  "denied" | "granted" | "prompt" | "unknown"
> {
  try {
    if (!navigator.permissions) return "unknown";
    const result = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return result.state as "denied" | "granted" | "prompt";
  } catch {
    return "unknown";
  }
}
