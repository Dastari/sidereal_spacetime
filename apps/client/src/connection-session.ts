// Shared transport lifecycle; game and Shipyard retain independent composition and builds.
export {
  createConnectionSession,
  type GameAuthentication,
} from "@sidereal/net/connection-session";
