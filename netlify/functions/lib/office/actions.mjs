// The endpoint at src/pages/office/api/[action].ts dispatches on this map.
// Every entry except login runs behind the middleware guard.
import { login } from './actions/login.mjs';
import { logout } from './actions/logout.mjs';
import { client } from './actions/client.mjs';

export const actions = { __proto__: null, login, logout, client };
