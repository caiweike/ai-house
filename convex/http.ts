import { auth } from './auth';
import { httpRouter } from 'convex/server';

const http = httpRouter();
auth.addHttpRoutes(http);
// The house does not generate music. Do not expose the legacy unauthenticated webhook.
export default http;
