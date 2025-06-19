const options: WebTransportOptions = {
  serverCertificateHashes: [],
};

if (__WT_CERT_HASH__) {
  const certHash = new Uint8Array(JSON.parse(__WT_CERT_HASH__));
  options.serverCertificateHashes.push({
    algorithm: "sha-256",
    value: certHash,
  });
}

export const wt = new WebTransport("https://localhost:4433", options);
