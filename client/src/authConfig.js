export const msalConfig = {
  auth: {
    clientId: "1efbf2eb-060e-4066-9a80-c2ca84b29f79",
    authority: "https://login.microsoftonline.com/c5602ef8-4738-454c-92ce-ea1546d7e078",
    redirectUri: "http://localhost:3000",
postLogoutRedirectUri: "http://localhost:3000",
// or your dev URL
  },
  cache: {
    cacheLocation: "sessionStorage", // or "localStorage"
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", "email"], // add custom scopes later
};
export const ADMIN_GROUP_ID = "1ad97d69-6787-4e72-97fe-0d5d6186bea8"; // from Entra group
