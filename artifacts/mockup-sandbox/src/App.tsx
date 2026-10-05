import type { ComponentType } from "react";

type MockupModule = Record<string, unknown>;

const mockups = import.meta.glob<MockupModule>("./components/mockups/**/*.tsx", {
  eager: true,
});

function getPreviewTarget() {
  const basePath = import.meta.env.BASE_URL;
  const route = window.location.pathname.startsWith(basePath)
    ? window.location.pathname.slice(basePath.length)
    : window.location.pathname.replace(/^\/+/, "");
  const segments = route.split("/").filter(Boolean);

  if (segments[0] !== "preview" || segments.length < 3) {
    return null;
  }

  return {
    group: segments.slice(1, -1).join("/"),
    componentName: segments.at(-1) || "",
  };
}

function resolveComponent(module: MockupModule | undefined, name: string) {
  if (!module) return undefined;

  const namedExport = module[name];
  if (typeof namedExport === "function") {
    return namedExport as ComponentType;
  }

  const defaultExport = module.default;
  if (typeof defaultExport === "function") {
    return defaultExport as ComponentType;
  }

  const firstComponent = Object.values(module).find(
    (value) => typeof value === "function",
  );
  return firstComponent as ComponentType | undefined;
}

function App() {
  const target = getPreviewTarget();

  if (!target) {
    const entries = Object.keys(mockups)
      .map((path) => {
        const match = path.match(/^\.\/components\/mockups\/(.+)\/([^/]+)\.tsx$/);
        return match ? { group: match[1], name: match[2] } : null;
      })
      .filter((entry): entry is { group: string; name: string } => entry !== null);

    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Component sandbox
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Available previews</h1>
          {entries.length ? (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {entries.map(({ group, name }) => (
                <li key={`${group}/${name}`}>
                  <a
                    className="block rounded-xl border border-border bg-card p-4 font-medium text-card-foreground transition hover:border-primary"
                    href={`${import.meta.env.BASE_URL}preview/${group}/${name}`}
                  >
                    {group} / {name}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted-foreground">No preview components are available yet.</p>
          )}
        </div>
      </main>
    );
  }

  const module = mockups[`./components/mockups/${target.group}/${target.componentName}.tsx`];
  const Preview = resolveComponent(module, target.componentName);

  if (!Preview) {
    return (
      <main className="min-h-screen bg-background p-8 text-foreground">
        <h1 className="text-xl font-semibold">Preview not found</h1>
        <p className="mt-2 text-muted-foreground">
          Could not load {target.group}/{target.componentName}.
        </p>
      </main>
    );
  }

  return <Preview />;
}

export default App;
