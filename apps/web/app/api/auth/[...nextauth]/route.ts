import { handlers } from "@/auth";

export const runtime = "nodejs"; // bcrypt requires the Node runtime

export const { GET, POST } = handlers;
