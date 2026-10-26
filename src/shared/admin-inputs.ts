export interface AdminSettingsInput {
  target: string;
  serverPassword?: string;
  passwordAction?: "keep" | "replace" | "remove";
  accessMode: "fixed" | "open";
  siteName: string;
  welcomeText: string;
  welcomeTextEn?: string;
  welcomeTextDe?: string;
  welcomeTextRu?: string;
  welcomeTextJa?: string;
  webRtcEnabled: boolean;
  webRtcPublicHost?: string;
  webRtcIpv6Enabled?: boolean;
  webRtcStunServer?: string;
  webRtcUdpStart?: number;
  webRtcUdpEnd?: number;
  /** Raw JSON array of {urls, username?, credential?} for screen-share ICE;
   *  empty string clears the override. Validated server-side before storing. */
  screenShareIceServersJson?: string;
}
