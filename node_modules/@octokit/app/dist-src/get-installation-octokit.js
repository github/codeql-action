import { createAppAuth } from "@octokit/auth-app";
async function getInstallationOctokit(app, installationId) {
  return app.octokit.auth({
    type: "installation",
    installationId,
    factory(auth) {
      const options = {
        ...auth.octokitOptions,
        authStrategy: createAppAuth,
        ...{ auth: { ...auth, installationId } }
      };
      return new auth.octokit.constructor(options);
    }
  });
}
export {
  getInstallationOctokit
};
