interface Window {
  remoNative?: {
    request(req: { method: string; url: string }): Promise<{ status: number; body: string; error?: string }>;
  };
}
