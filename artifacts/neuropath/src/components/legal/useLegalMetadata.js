import { useEffect } from "react";

export default function useLegalMetadata(title, description) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | NeuroPathways`;
    const updates = [
      ["name", "description", description],
      ["property", "og:title", document.title],
      ["property", "og:description", description],
    ].map(([attribute, key, content]) => {
      let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
      const created = !node;
      if (!node) {
        node = document.createElement("meta");
        node.setAttribute(attribute, key);
        document.head.appendChild(node);
      }
      const previous = node.getAttribute("content");
      node.setAttribute("content", content);
      return { node, created, previous };
    });
    return () => {
      document.title = previousTitle;
      updates.forEach(({ node, created, previous }) => {
        if (created) node.remove();
        else if (previous === null) node.removeAttribute("content");
        else node.setAttribute("content", previous);
      });
    };
  }, [title, description]);
}
