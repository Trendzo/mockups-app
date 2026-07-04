// Typed stub for @msg91comm/sendotp-react-native. The package ships raw (and
// type-erroring) TS source; tsconfig `paths` redirects tsc here so it never
// compiles that source. Metro still bundles the real package at runtime.

export interface Msg91Response {
  type?: string;
  message?: string;
  [key: string]: unknown;
}

export const OTPWidget: {
  initializeWidget(widgetId: string, tokenAuth: string): void;
  sendOTP(data: { identifier: string }): Promise<Msg91Response>;
  retryOTP(data: { reqId: string; retryChannel?: number }): Promise<Msg91Response>;
  verifyOTP(data: { reqId: string; otp: string }): Promise<Msg91Response>;
};
