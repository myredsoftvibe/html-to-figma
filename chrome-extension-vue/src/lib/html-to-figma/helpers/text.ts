import { WithRef } from "../types/nodes";
import { isHidden } from "./nodes";
import { fastClone } from "./object";
import { parseUnits, getRgb } from "./parsers";

/**
 * Returns true when a text node lives alongside other nodes (elements or
 * non-empty text) inside its parent — i.e. "mixed content" like:
 *   <li><strong>Bold</strong> rest of text</li>
 * In that case building a separate TEXT layer per fragment causes overlaps
 * in Figma, so we skip such nodes entirely.
 */
function hasSiblings(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  for (const child of Array.from(parent.childNodes)) {
    if (child === node) continue;
    if (child.nodeType === Node.ELEMENT_NODE) return true;
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) return true;
  }
  return false;
}

export const buildTextNode = ({
  node,
}: {
  node: Node;
}): WithRef<TextNode> | undefined => {
  const trimmedText = node.textContent?.trim() || "";

  if (!trimmedText.length) {
    return undefined;
  }

  const parent = node.parentElement;
  if (parent) {
    if (isHidden(parent)) {
      return undefined;
    }

    // Skip text fragments that are part of mixed content (e.g.
    // <li><strong>x</strong> y</li>). Each fragment would get its own
    // overlapping TEXT layer. The visual area is already covered by the
    // parent RECTANGLE from generateElements.
    if (hasSiblings(node)) {
      return undefined;
    }

    const computedStyles = getComputedStyle(parent);
    const range = document.createRange();
    range.selectNode(node);
    const rect = fastClone(range.getBoundingClientRect());
    const lineHeight = parseUnits(computedStyles.lineHeight);
    range.detach();

    // getBoundingClientRect() returns viewport-relative coords.
    // Add scroll offset so text node positions are page-relative.
    rect.top += window.scrollY;
    rect.left += window.scrollX;

    if (lineHeight && rect.height < lineHeight.value) {
      const delta = lineHeight.value - rect.height;
      rect.top -= delta / 2;
      rect.height = lineHeight.value;
    }
    if (rect.height < 1 || rect.width < 1) {
      return undefined;
    }

    const textNode: WithRef<TextNode> = {
      x: Math.round(rect.left),
      ref: node,
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      type: "TEXT",
      characters: trimmedText.replace(/\s+/g, " "),
    };

    const fills: SolidPaint[] = [];
    const rgb = getRgb(computedStyles.color);

    if (rgb) {
      fills.push({
        type: "SOLID",
        color: {
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
        },
        opacity: rgb.a || 1,
      } as SolidPaint);
    }

    if (fills.length) {
      textNode.fills = fills;
    }
    const letterSpacing = parseUnits(computedStyles.letterSpacing);
    if (letterSpacing) {
      textNode.letterSpacing = letterSpacing;
    }

    if (lineHeight) {
      textNode.lineHeight = lineHeight;
    }

    const { textTransform } = computedStyles;
    switch (textTransform) {
      case "uppercase": {
        textNode.textCase = "UPPER";
        break;
      }
      case "lowercase": {
        textNode.textCase = "LOWER";
        break;
      }
      case "capitalize": {
        textNode.textCase = "TITLE";
        break;
      }
    }

    const fontSize = parseUnits(computedStyles.fontSize);
    if (fontSize) {
      textNode.fontSize = Math.round(fontSize.value);
    }
    if (computedStyles.fontFamily) {
      (textNode as any).fontFamily = computedStyles.fontFamily;
    }

    if (
      ["underline", "strikethrough"].includes(computedStyles.textDecoration)
    ) {
      textNode.textDecoration =
        computedStyles.textDecoration.toUpperCase() as any;
    }

    if (
      ["left", "center", "right", "justified"].includes(
        computedStyles.textAlign
      )
    ) {
      textNode.textAlignHorizontal =
        computedStyles.textAlign.toUpperCase() as any;
    }

    return textNode;
  }
};
