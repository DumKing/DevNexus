import { register } from "@/app/plugin-registry/registry";
import { apiDebuggerPlugin } from "@/plugins/api-debugger";
import { confluencePlugin } from "@/plugins/confluence";
import { redisManagerPlugin } from "@/plugins/redis-manager";
import { mongodbClientPlugin } from "@/plugins/mongodb-client";
import { mysqlClientPlugin } from "@/plugins/mysql-client";
import { mqClientPlugin } from "@/plugins/mq-client";
import { networkToolsPlugin } from "@/plugins/network-tools";
import { s3ClientPlugin } from "@/plugins/s3-client";
import { sshClientPlugin } from "@/plugins/ssh-client";

let initialized = false;

export function registerBuiltinPlugins(): void {
  if (initialized) {
    return;
  }

  register(redisManagerPlugin);
  register(sshClientPlugin);
  register(s3ClientPlugin);
  register(mongodbClientPlugin);
  register(mysqlClientPlugin);
  register(networkToolsPlugin);
  register(apiDebuggerPlugin);
  register(mqClientPlugin);
  register(confluencePlugin);
  initialized = true;
}

