import { glbDelivery } from "./glb_delivery.mjs";
const root = process.env.SIDEREAL_PUBLIC_ROOT;
const target = process.env.SIDEREAL_PUBLIC_DATABASE_URL;
if (!root || !target)
  throw Error("Managed public delivery configuration required");
export default {
  root,
  publicDir: false,
  appType: "spa",
  build: { outDir: root },
  preview: {
    allowedHosts: JSON.parse(process.env.SIDEREAL_PUBLIC_ALLOWED_HOSTS ?? "[]"),
    proxy: { "/v1": { target, ws: true } },
  },
  plugins: [
    {
      name: "exact-native-glb-delivery",
      configurePreviewServer(server) {
        server.middlewares.use(glbDelivery(root));
      },
    },
  ],
};
