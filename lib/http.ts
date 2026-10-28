// Browser-side request helpers shared by the dashboards and forms.

export async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}

/** Sends FormData with XMLHttpRequest so upload progress can be shown. */
export function sendForm(method: string, url: string, body: FormData, onProgress: (pct: number) => void) {
  return new Promise<{ ok: boolean; data: { error?: string } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON response */
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
    };
    xhr.onerror = () => reject(new Error("Network error. Is the development server running?"));
    xhr.send(body);
  });
}

/** Fetches a file and saves it with the name from Content-Disposition. Throws the server's error message. */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) await readJson(res);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
