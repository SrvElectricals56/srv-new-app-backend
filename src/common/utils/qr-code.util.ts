const MAX_QR_INPUT_LENGTH = 2048;
const MAX_QR_CODE_LENGTH = 255;
const QR_QUERY_KEYS = ['qrCode', 'qr_code', 'qrcode', 'qr', 'qrId', 'qr_id', 'code', 'id'] as const;

function cleanCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  let candidate = value.trim();
  if (!candidate || candidate.length > MAX_QR_CODE_LENGTH) return null;

  if (
    (candidate.startsWith('"') && candidate.endsWith('"')) ||
    (candidate.startsWith("'") && candidate.endsWith("'"))
  ) {
    candidate = candidate.slice(1, -1).trim();
  }

  candidate = candidate.replace(/\.png$/i, '').trim();
  return candidate && candidate.length <= MAX_QR_CODE_LENGTH ? candidate : null;
}

function extractWrappedCandidate(input: string): string | null {
  if (input.startsWith('{') && input.endsWith('}')) {
    try {
      const payload = JSON.parse(input) as Record<string, unknown>;
      for (const key of QR_QUERY_KEYS) {
        const candidate = cleanCandidate(payload[key]);
        if (candidate) return candidate;
      }
    } catch {
      // Invalid JSON is handled as a raw candidate below.
    }
  }

  if (/^(https?:\/\/|srv-electricals:\/\/)/i.test(input)) {
    try {
      const url = new URL(input);
      for (const key of QR_QUERY_KEYS) {
        const candidate = cleanCandidate(url.searchParams.get(key));
        if (candidate) return candidate;
      }

      const lastPathSegment = url.pathname.split('/').filter(Boolean).pop();
      const candidate = cleanCandidate(lastPathSegment ? decodeURIComponent(lastPathSegment) : null);
      if (candidate) return candidate;
    } catch {
      // Invalid URLs are handled as raw candidates below.
    }
  }

  return null;
}

/**
 * Returns tightly-scoped lookup candidates for current raw codes and known
 * legacy wrappers. It intentionally never performs substring extraction.
 */
export function extractQrCodeCandidates(value?: string | null): string[] {
  const input = value?.trim();
  if (!input || input.length > MAX_QR_INPUT_LENGTH) return [];

  const wrappedCandidate = extractWrappedCandidate(input);
  if (wrappedCandidate) return [wrappedCandidate];

  if (input.includes('%')) {
    try {
      const decoded = decodeURIComponent(input);
      const decodedWrappedCandidate = extractWrappedCandidate(decoded);
      if (decodedWrappedCandidate) return [decodedWrappedCandidate];

      const decodedCandidate = cleanCandidate(decoded);
      if (decodedCandidate) return [decodedCandidate];
    } catch {
      // Malformed URL encoding remains an invalid raw value.
    }
  }

  const rawCandidate = cleanCandidate(input);
  return rawCandidate ? [rawCandidate] : [];
}
