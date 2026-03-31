(function initAmethystSite() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let observer = null;

  function show(node) {
    node.classList.add("is-visible");
  }

  function ensureObserver() {
    if (observer || reduceMotion || !("IntersectionObserver" in window)) {
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            show(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.16,
        rootMargin: "0px 0px -8% 0px",
      },
    );
  }

  function observeReveal(node, delay = 0) {
    if (!node) {
      return;
    }

    node.setAttribute("data-reveal", "");
    node.style.setProperty("--reveal-delay", `${delay}ms`);

    if (reduceMotion || !("IntersectionObserver" in window)) {
      show(node);
      return;
    }

    ensureObserver();
    observer.observe(node);
  }

  function initReveal(root = document) {
    const nodes = [...root.querySelectorAll("[data-reveal]")];
    nodes.forEach((node, index) => {
      if (!node.style.getPropertyValue("--reveal-delay")) {
        node.style.setProperty("--reveal-delay", `${Math.min(index * 70, 420)}ms`);
      }

      if (reduceMotion || !("IntersectionObserver" in window)) {
        show(node);
        return;
      }

      ensureObserver();
      observer.observe(node);
    });
  }

  const api = {
    observeReveal,
    initReveal,
    reduceMotion,
  };

  window.AmethystSite = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initReveal());
  } else {
    initReveal();
  }
})();
