export type RepositoryLink = { path: string; fragment: string };
export function resolveRepositoryLink(
  currentPath: string,
  href: string,
  paths: readonly string[],
): RepositoryLink | null {
  if (!href || href.length > 8192 || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href))
    return null;
  const separator = href.indexOf("#");
  let target: string;
  let fragment: string;
  try {
    target = decodeURIComponent(
      separator < 0 ? href : href.slice(0, separator),
    );
    fragment = decodeURIComponent(
      separator < 0 ? "" : href.slice(separator + 1),
    );
  } catch {
    return null;
  }
  if (/[\\:\x00-\x1f?]/.test(target) || /[\x00-\x1f]/.test(fragment))
    return null;
  const components = target.startsWith("/")
    ? []
    : currentPath.split("/").slice(0, -1);
  if (!target)
    return paths.includes(currentPath) ? { path: currentPath, fragment } : null;
  for (const component of target.split("/")) {
    if (component === "" || component === ".") continue;
    if (component === "..") {
      if (!components.length) return null;
      components.pop();
    } else {
      if (component.toLowerCase() === ".git") return null;
      components.push(component);
    }
  }
  const path = components.join("/");
  const found = [path, `${path}/README.md`, `${path}/index.md`].find(
    (candidate) => paths.includes(candidate),
  );
  return found ? { path: found, fragment } : null;
}
