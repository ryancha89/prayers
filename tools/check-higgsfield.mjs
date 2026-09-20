// Local developer tool only; never import into the mobile app.
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

try {
  loadEnvFile(fileURLToPath(new URL('../.env.higgsfield.local', import.meta.url)));
  const id = process.env.HF_API_KEY_ID?.trim();
  const secret = process.env.HF_API_KEY_SECRET?.trim();
  if (!id || !secret) {
    console.error('Missing HF_API_KEY_ID or HF_API_KEY_SECRET.');
    process.exitCode = 1;
  } else {
    // A nonexistent request checks access without submitting a paid generation.
    const url = `https://api.higgsfield.ai/requests/${randomUUID()}/status`;
    const probe = async headers => {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      });
      await response.body?.cancel();
      return response.status;
    };
    const anonymous = await probe({});
    const authenticated = await probe({ Authorization: `Key ${id}:${secret}` });
    console.log(JSON.stringify({ anonymousStatus: anonymous, authenticatedStatus: authenticated }));
    if (anonymous === 401 && authenticated === 404) {
      console.log('Credentials passed the authentication gate; the test request does not exist. Model access and credits remain unverified.');
    } else {
      console.error('Authentication was not confirmed. Check credentials/account access.');
      process.exitCode = 1;
    }
  }
} catch {
  // Never log errors that could include credentials or response contents.
  console.error('Check failed: verify the local environment file and network connectivity.');
  process.exitCode = 1;
}
