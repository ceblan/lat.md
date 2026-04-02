import type { Node as SyntaxNode, Tree } from 'web-tree-sitter';
import type { SourceSymbol } from '../source-parser.js';

function extractName(node: SyntaxNode): string | null {
  const nameNode = node.childForFieldName('name');
  return nameNode ? nameNode.text : null;
}

function firstLine(text: string): string {
  const nl = text.indexOf('\n');
  return nl === -1 ? text : text.slice(0, nl);
}

function extractPhpClassMembers(
  classNode: SyntaxNode,
  className: string,
  symbols: SourceSymbol[],
): void {
  const body =
    classNode.namedChildren.find((c) => c.type === 'declaration_list') ??
    classNode.namedChildren.find((c) => c.type === 'enum_declaration_list');
  if (!body) return;

  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i)!;
    if (member.type !== 'method_declaration') continue;

    const name = extractName(member);
    if (!name) continue;

    symbols.push({
      name,
      kind: 'method',
      parent: className,
      startLine: member.startPosition.row + 1,
      endLine: member.endPosition.row + 1,
      signature: firstLine(member.text),
    });
  }
}

/** Extract top-level PHP symbols plus class-like members (methods). */
export function extractPhpSymbols(tree: Tree): SourceSymbol[] {
  const symbols: SourceSymbol[] = [];
  const root = tree.rootNode;

  for (let i = 0; i < root.childCount; i++) {
    const node = root.child(i)!;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    if (node.type === 'function_definition') {
      const name = extractName(node);
      if (name) {
        symbols.push({
          name,
          kind: 'function',
          startLine,
          endLine,
          signature: firstLine(node.text),
        });
      }
      continue;
    }

    if (node.type === 'class_declaration') {
      const name = extractName(node);
      if (name) {
        symbols.push({
          name,
          kind: 'class',
          startLine,
          endLine,
          signature: firstLine(node.text),
        });
        extractPhpClassMembers(node, name, symbols);
      }
      continue;
    }

    if (node.type === 'interface_declaration') {
      const name = extractName(node);
      if (name) {
        symbols.push({
          name,
          kind: 'interface',
          startLine,
          endLine,
          signature: firstLine(node.text),
        });
        extractPhpClassMembers(node, name, symbols);
      }
      continue;
    }

    if (node.type === 'trait_declaration' || node.type === 'enum_declaration') {
      const name = extractName(node);
      if (name) {
        symbols.push({
          name,
          kind: 'class',
          startLine,
          endLine,
          signature: firstLine(node.text),
        });
        extractPhpClassMembers(node, name, symbols);
      }
      continue;
    }

    if (node.type === 'const_declaration') {
      for (const child of node.namedChildren) {
        if (child.type !== 'const_element') continue;

        const nameNode = child.namedChildren.find((c) => c.type === 'name');
        if (!nameNode) continue;

        symbols.push({
          name: nameNode.text,
          kind: 'const',
          startLine,
          endLine,
          signature: firstLine(node.text),
        });
      }
    }
  }

  return symbols;
}
