import { PLATFORMS } from './model.mjs';
import { acquirePlatformLock } from './platform-lock.mjs';

// Metadata while the browser uploads is safe only after all old Ego controllers
// have exited. Lock every platform, including siblings left after a CLI crash.
export function acquireMetadataControllerLocks(options = {}) {
  const releases = [];
  try {
    for (const platform of PLATFORMS) releases.push(acquirePlatformLock(platform, 'metadata', options));
  } catch (error) {
    for (const release of releases.reverse()) release();
    throw error;
  }
  return () => { for (const release of releases.reverse()) release(); };
}
