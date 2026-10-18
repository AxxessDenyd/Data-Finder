import { createFileRoute } from "@tanstack/react-router";
import { FileManager } from "@/components/file-manager";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <FileManager />;
}
