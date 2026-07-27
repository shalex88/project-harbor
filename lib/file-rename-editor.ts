type SetValue<T> = (value: T) => void;

export function cancelFileRename(
  setError: SetValue<string>,
  setFileId: SetValue<string | null>,
): void {
  setError("");
  setFileId(null);
}
