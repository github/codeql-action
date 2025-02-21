function getOAuthClientCode() {
  return `import { Octokit: Core } from "https://esm.sh/@octokit/core";
    
    export const Octokit = Core.defaults({
      oauth: {}
    })`;
}
export {
  getOAuthClientCode
};
