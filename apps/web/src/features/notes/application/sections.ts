import type { BlockNode, HeadingBlock } from "@/domain/note/models";

export function getSectionRange(blocks: BlockNode[], headingIndex: number): [number, number] {
  const heading = blocks[headingIndex];
  if (heading?.type !== "heading") return [headingIndex + 1, headingIndex];

  let end = headingIndex + 1;
  while (end < blocks.length) {
    const block = blocks[end];
    if (block.type === "heading" && block.level <= heading.level) break;
    end += 1;
  }
  return [headingIndex + 1, end - 1];
}

export function isHeadingBlock(block: BlockNode): block is HeadingBlock {
  return block.type === "heading";
}

export function toggleSection(blocks: BlockNode[], headingIndex: number): BlockNode[] {
  if (!isHeadingBlock(blocks[headingIndex])) return blocks;
  return blocks.map((block, index) => {
    if (index !== headingIndex || block.type !== "heading") return block;
    return { ...block, collapsed: !block.collapsed };
  });
}

export function setSectionsCollapsed(blocks: BlockNode[], level: 1 | 2 | 3, collapsed: boolean): BlockNode[] {
  return blocks.map((block) => {
    if (block.type !== "heading" || block.level !== level) return block;
    return { ...block, collapsed };
  });
}

export function expandAllSections(blocks: BlockNode[]): BlockNode[] {
  return blocks.map((block) => block.type === "heading"
    ? { ...block, collapsed: false }
    : block);
}

export function getCollapsedBlockIds(blocks: BlockNode[]): Set<string> {
  const hidden = new Set<string>();
  blocks.forEach((block, index) => {
    if (block.type !== "heading" || !block.collapsed) return;
    const [start, end] = getSectionRange(blocks, index);
    for (let contentIndex = start; contentIndex <= end; contentIndex += 1) {
      const content = blocks[contentIndex];
      if (content) hidden.add(content.id);
    }
  });
  return hidden;
}
