import React from "react";

interface LinkifiedTextProps {
    text: string;
    className?: string;
}

export function LinkifiedText({ text, className }: LinkifiedTextProps) {
    // Regular expression to match URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Split text by URLs and keep the URLs in the result array
    const parts = text.split(urlRegex);

    return (
        <span className={className}>
            {parts.map((part, i) => {
                // Since the regex uses a capturing group, every odd index in the split result is a match.
                if (i % 2 === 1) {
                    return (
                        <a
                            key={i}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline break-all"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {part}
                        </a>
                    );
                }
                return part;
            })}
        </span>
    );
}
