/**
 * A few browser extensions annotate existing HTML before React starts. Remove
 * only the marker attributes observed in the reported browser so they do not
 * get mistaken for application-rendered attributes during hydration.
 */
export const preHydrationAttributeCleanup = String.raw`(() => {
  const processedMarker = /^__processed_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}__$/i;

  function cleanElement(element) {
    if (!(element instanceof Element)) return;
    element.removeAttribute("bis_skin_checked");
    if (element !== document.body) return;
    element.removeAttribute("bis_register");
    element.removeAttribute("cz-shortcut-listen");
    for (const attribute of Array.from(element.attributes)) {
      if (processedMarker.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  }

  function cleanTree(root) {
    if (root instanceof Element) cleanElement(root);
    if (root instanceof Document) root = root.documentElement;
    if (root instanceof Element || root instanceof DocumentFragment) {
      root.querySelectorAll("*").forEach(cleanElement);
    }
  }

  const root = document.documentElement;
  if (!root) return;

  cleanTree(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") cleanElement(record.target);
      for (const node of record.addedNodes) cleanTree(node);
    }
  });
  observer.observe(root, { attributes: true, childList: true, subtree: true });

  let timeout;
  const stop = () => {
    cleanTree(document.documentElement);
    observer.disconnect();
    window.removeEventListener("load", stop);
    window.clearTimeout(timeout);
  };
  window.addEventListener("load", stop, { once: true });
  timeout = window.setTimeout(stop, 2000);
})();`;
