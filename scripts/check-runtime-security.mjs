import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Stable release floors for the October 21, 2026 advisory, not a general security guarantee.
export const patchedBranches = Object.freeze({22:[23,4],24:[22,1],26:[12,1]});

export function isPatchedForOctoberAdvisory(version) {
  if(typeof version!=='string')return false;
  const match=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if(!match)return false;
  const [major,minor,patch]=match.slice(1).map(Number),floor=patchedBranches[major];
  return Boolean(floor&&(minor>floor[0]||(minor===floor[0]&&patch>=floor[1])));
}

export function assessRuntime(version,env={},execArgs=[]) {
  const options=[...execArgs,env.NODE_OPTIONS??''].join(' ');
  return {
    runtimeVersion:version,
    patchedForOctoberAdvisory:isPatchedForOctoberAdvisory(version),
    tlsVerificationDisabled:env.NODE_TLS_REJECT_UNAUTHORIZED==='0',
    extraCaConfigured:Boolean(env.NODE_EXTRA_CA_CERTS),
    alternativeTrustStoreConfigured:/--use-(openssl|system)-ca\b/.test(options),
  };
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const root=path.resolve(import.meta.dirname,'..');
  const target=(await readFile(path.join(root,'.node-version'),'utf8')).trim();
  const report={advisory:'Node/eMudhra 2026-10-21',...assessRuntime(process.version,process.env,process.execArgv),
    repositoryTarget:target,repositoryTargetPatched:isPatchedForOctoberAdvisory(target),
    scope:'current-process-version-and-trust-flags-only; not Render production, CA rejection or compatibility approval'};
  console.log(JSON.stringify(report,null,2));
  if(!report.patchedForOctoberAdvisory||report.tlsVerificationDisabled||!report.repositoryTargetPatched)process.exitCode=2;
}
