/**
 * Built-in demo corpus for the Cognitive M Network.
 *
 * The "Load demo" button ingests these few short "files" so the three-layer
 * memory (Ontology / Fact / Passage) populates instantly and you can ask
 * questions about them — no typing, no backend, no LLM key required (the engine
 * falls back to a deterministic heuristic offline). Topic mirrors the sample
 * query shown in the HUD: "What is the role of mitochondria in apoptosis?".
 */
import type { SourceDocument } from '../../lib/memoryGraphRag';

export const DEMO_DOCS: SourceDocument[] = [
    {
        sourceId: 'demo:overview',
        sourceKind: 'upload',
        title: 'Apoptosis — Overview',
        text:
            'Mitochondria play a central role in apoptosis, the process of programmed cell death. ' +
            'In response to cellular stress, the tumor suppressor protein p53 induces the pro-apoptotic protein BAX. ' +
            'BAX promotes mitochondrial outer membrane permeabilization (MOMP), which releases cytochrome c from the ' +
            'mitochondrial intermembrane space into the cytosol. Cytochrome c binds APAF-1 to form the apoptosome, a ' +
            'complex that activates caspase-9. Caspase-9 then cleaves and activates caspase-3, the executioner caspase ' +
            'that dismantles the cell. The anti-apoptotic protein BCL-2 inhibits BAX and prevents cytochrome c release, ' +
            'while BID and PUMA promote BAX activation. Reactive oxygen species (ROS) from the electron transport chain ' +
            'also trigger apoptosis, and calcium overload opens the mitochondrial permeability transition pore (MPTP).',
    },
    {
        sourceId: 'demo:pathways',
        sourceKind: 'upload',
        title: 'Intrinsic vs Extrinsic Pathways',
        text:
            'Apoptosis proceeds through two principal pathways that converge on caspase activation. The intrinsic ' +
            'pathway, also called the mitochondrial pathway, is triggered by internal stress such as DNA damage, ' +
            'oxidative stress, and growth factor withdrawal. These signals converge on the mitochondria, where the ' +
            'BCL-2 family decides the cell fate; BAX and BAK oligomerize to cause MOMP and release cytochrome c and ' +
            'SMAC. The extrinsic pathway begins at the cell surface when death ligands such as FAS ligand and TNF bind ' +
            'death receptors FAS and TNFR1, recruiting the adaptor FADD to activate caspase-8. Caspase-8 cleaves ' +
            'caspase-3 directly, and also cleaves BID to truncated BID, which activates BAX and amplifies the signal ' +
            'through the mitochondria. The tumor suppressor p53 induces BAX, PUMA, and NOXA after genotoxic stress.',
    },
    {
        sourceId: 'demo:bcl2',
        sourceKind: 'upload',
        title: 'The BCL-2 Protein Family',
        text:
            'The BCL-2 protein family is the central regulator of the intrinsic apoptosis pathway. The anti-apoptotic ' +
            'guardians BCL-2, BCL-XL, and MCL-1 preserve mitochondrial integrity by sequestering pro-apoptotic ' +
            'relatives. The effectors BAX and BAK execute permeabilization by oligomerizing in the outer mitochondrial ' +
            'membrane to release cytochrome c. The BH3-only proteins BID, BIM, BAD, PUMA, and NOXA act as stress ' +
            'sensors: activators such as BID and BIM bind BAX and BAK directly, while sensitizers such as BAD and NOXA ' +
            'neutralize the guardians. NOXA selectively antagonizes MCL-1, while BAD inhibits BCL-2 and BCL-XL. Cancer ' +
            'cells overexpress BCL-2 or MCL-1 to evade apoptosis, so BH3 mimetics such as venetoclax inhibit BCL-2 to ' +
            'restore cell death in leukemia.',
    },
    {
        sourceId: 'demo:caspases',
        sourceKind: 'upload',
        title: 'Caspase Cascade and Execution',
        text:
            'Caspases are the cysteine proteases that carry out apoptosis, cleaving substrates after aspartate ' +
            'residues. They are produced as inactive procaspases and divide into initiators and executioners. The ' +
            'initiator caspase-9 is activated on the apoptosome assembled by cytochrome c and APAF-1, while caspase-8 ' +
            'is activated on the death-inducing signaling complex assembled by FADD. Active initiator caspases cleave ' +
            'and activate the executioner caspases caspase-3 and caspase-7. Caspase-3 cleaves hundreds of substrates: ' +
            'it cleaves ICAD to release the nuclease CAD which fragments DNA, cleaves PARP to halt DNA repair, and ' +
            'cleaves lamins to disassemble the nuclear envelope. XIAP restrains caspase-3, caspase-7, and caspase-9, ' +
            'while SMAC released from the mitochondria antagonizes XIAP to unleash the caspases.',
    },
];

/** Suggested questions to try after loading the demo. */
export const DEMO_QUESTIONS = [
    'What is the role of mitochondria in apoptosis?',
    'How does BCL-2 regulate cell death?',
    'What activates caspase-3?',
];
