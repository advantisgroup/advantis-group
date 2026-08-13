type AcceptedCredentialsSignal = {
  rpId: string;
  userId: string;
  allAcceptedCredentialIds: string[];
};

type SignalApi = typeof PublicKeyCredential & {
  signalAllAcceptedCredentials?: (options: AcceptedCredentialsSignal) => Promise<void>;
  signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>;
};

function signalApi(): SignalApi | null {
  if (typeof PublicKeyCredential === "undefined") return null;
  return PublicKeyCredential as SignalApi;
}

export async function signalAcceptedPasskeys(signal: AcceptedCredentialsSignal): Promise<void> {
  await signalApi()?.signalAllAcceptedCredentials?.(signal);
}

export async function signalUnknownPasskey(rpId: string, credentialId: string): Promise<void> {
  await signalApi()?.signalUnknownCredential?.({ rpId, credentialId });
}
