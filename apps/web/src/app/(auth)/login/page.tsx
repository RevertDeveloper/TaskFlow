import { redirect } from "next/navigation";

import { accountsLoginUrl } from "@/infrastructure/accounts/client";

export default function LoginPage() {
  redirect(accountsLoginUrl("/"));
}