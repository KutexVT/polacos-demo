import { defineRailway, preserve, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "polacos-demo";

export default defineRailway(() => {
  const polacos = service("polacos-demo", {
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    env: {
      ADMIN_NAME: preserve(),
      ADMIN_PASSWORD: preserve(),
      ADMIN_USERNAME: preserve(),
      APP_ORIGIN: preserve(),
      DATABASE_URL: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
    },
    // builder from CaC: "DOCKERFILE"
  });
  return project("polacos-demo", {
    resources: [polacos],
  });
});
