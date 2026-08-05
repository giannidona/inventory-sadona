export type ParsedShipmentQr = {
  envioId: string;
  senderId: string | null;
  hashCode: string | null;
  securityDigit: string | null;
  raw: string;
};

/**
 * Mercado Envíos (Flex) QR codes decode to a small JSON blob, e.g.:
 *   {"id":"47678049887","sender_id":419582725,"hash_code":"...","security_digit":"0"}
 *
 * "id" is the envío/shipment number (matches the "Envío" field printed on
 * the label, e.g. "4767804 9887" -> "47678049887") — NOT the "Pack ID"
 * printed separately above it on the label.
 *
 * Falls back to using the raw scanned text as-is if it isn't valid JSON, in
 * case some other courier's label ever scans as a plain code instead.
 */
export function parseShipmentQr(raw: string): ParsedShipmentQr {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        id?: string | number;
        sender_id?: string | number;
        hash_code?: string;
        security_digit?: string | number;
      };

      if (parsed.id != null) {
        return {
          envioId: String(parsed.id),
          senderId:
            parsed.sender_id != null ? String(parsed.sender_id) : null,
          hashCode: parsed.hash_code ?? null,
          securityDigit:
            parsed.security_digit != null
              ? String(parsed.security_digit)
              : null,
          raw: trimmed,
        };
      }
    } catch {
      // Not valid JSON — fall through to the plain-text fallback below.
    }
  }

  return {
    envioId: trimmed,
    senderId: null,
    hashCode: null,
    securityDigit: null,
    raw: trimmed,
  };
}
