// The destination package ships its brand icons and imports them with Vite's
// `?url` suffix (same shape the console used before the icons module existed).
declare module "*.svg?url" {
  const url: string;
  export default url;
}
