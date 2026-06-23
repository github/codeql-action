/** Represents remote file addresses. */
export interface RemoteFileAddress {
  /** The owner of the repository. */
  owner: string;
  /** The repository name. */
  repo: string;
  /** The path of the file. */
  path: string;
  /** The ref of the repository. */
  ref: string;
}
