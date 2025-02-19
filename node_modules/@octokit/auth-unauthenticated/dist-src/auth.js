async function auth(reason) {
  return {
    type: "unauthenticated",
    reason
  };
}
export {
  auth
};
