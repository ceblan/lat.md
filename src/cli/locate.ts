import { findLatticeDir, loadAllSections, findSections } from '../lattice.js';
import { formatSectionPreview } from '../format.js';

export async function locate(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Usage: lat locate <query>');
    process.exit(1);
  }

  const query = args[0];

  const latticeDir = findLatticeDir();
  if (!latticeDir) {
    console.error('No .lattice directory found');
    process.exit(1);
  }

  const sections = await loadAllSections(latticeDir);
  const matches = findSections(sections, query);

  if (matches.length === 0) {
    console.error(`No sections matching "${query}"`);
    process.exit(1);
  }

  for (let i = 0; i < matches.length; i++) {
    if (i > 0) console.log('');
    console.log(formatSectionPreview(matches[i], latticeDir));
  }
}
