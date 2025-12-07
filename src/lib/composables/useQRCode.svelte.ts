/**
 * QR Code Composable
 * Manages QR code generation for join URL
 */

import { browser } from "$app/environment";
import QRCode from "qrcode";

export function useQRCode() {
  let qrCodeDataUrl = $state("");
  let joinUrl = $state("");

  /**
   * Generate QR code for the join URL
   */
  async function generate(size: number = 400) {
    if (!browser) return;

    try {
      joinUrl = window.location.href.replace("/host/", "/play/");
      const url = await QRCode.toDataURL(joinUrl, { width: size });
      qrCodeDataUrl = url;
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    }
  }

  return {
    get qrCodeDataUrl() {
      return qrCodeDataUrl;
    },
    get joinUrl() {
      return joinUrl;
    },
    generate,
  };
}
