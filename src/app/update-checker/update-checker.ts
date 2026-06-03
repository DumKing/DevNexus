export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  name?: string;
  html_url: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  assets: GitHubReleaseAsset[];
  publishedAt?: string;
}

const LATEST_RELEASE_URL = "https://api.github.com/repos/DumKing/DevNexus/releases/latest";

export function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left: string, right: string): number {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

export async function checkLatestRelease(currentVersion: string): Promise<UpdateCheckResult> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`Check update failed: GitHub release API returned ${response.status}`);
  }
  const release = await response.json() as GitHubRelease;
  const latestVersion = release.tag_name || release.name || "";
  if (!latestVersion) {
    throw new Error("Check update failed: latest release tag is missing");
  }
  return {
    currentVersion,
    latestVersion,
    hasUpdate: isNewerVersion(latestVersion, currentVersion),
    releaseUrl: release.html_url,
    assets: release.assets ?? [],
    publishedAt: release.published_at,
  };
}
