import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

function MermaidBlock({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    setError(null);
    container.innerHTML = "";
    void import("mermaid").then((mermaid) => {
      if (cancelled) return;
      mermaid.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        themeVariables: {
          fontFamily: "Arial, sans-serif",
          primaryColor: "#eef6ff",
          primaryBorderColor: "#5b8def",
          lineColor: "#5f6f89",
        },
      });
      const renderId = `confluence-preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      mermaid.default.render(renderId, source)
        .then(({ svg }) => {
          if (!cancelled && container) {
            container.innerHTML = svg;
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(String(err));
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return <pre className="devnexus-markdown-code devnexus-markdown-error">{error}</pre>;
  }
  return <div ref={containerRef} className="devnexus-markdown-mermaid" />;
}

const markdownComponents: Components = {
  code(props) {
    const { className, children, ...rest } = props;
    const language = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
    const source = String(children ?? "").replace(/\n$/, "");
    if (language.toLowerCase() === "mermaid") {
      return <MermaidBlock source={source} />;
    }
    return (
      <code className={className ? `devnexus-markdown-inline-code ${className}` : "devnexus-markdown-inline-code"} {...rest}>
        {children}
      </code>
    );
  },
  pre(props) {
    return <pre className="devnexus-markdown-code" {...props} />;
  },
  table(props) {
    return <table className="devnexus-markdown-table" {...props} />;
  },
  a(props) {
    return <a target="_blank" rel="noreferrer" {...props} />;
  },
};

export function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="devnexus-markdown-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
