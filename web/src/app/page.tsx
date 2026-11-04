import { Suspense } from "react";
import { Directory, DirectoryLoading } from "../components/directory";

export default function HomePage() {
  return (
    <Suspense fallback={<DirectoryLoading />}>
      <Directory />
    </Suspense>
  );
}
