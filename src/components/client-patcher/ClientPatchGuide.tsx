import { Fragment, useState } from 'react';
import { CollapsibleSection } from '../CollapsibleSection';
import { CopyButton, DownloadButton } from '../CopyButton';
import { StackHead } from '../Shell';
import { BUILTIN_PATCHES } from '../../features/client-patcher/catalog';
import schema from '../../features/client-patcher/client-patch.schema.json?raw';

const examples = [
  { id: 'multiple-instances', label: 'Byte replacement: multiple instances' },
  { id: 'filename-item-data', label: 'String replacement: package entry name' },
  { id: 'gateway-addresses', label: 'Strings and numbers: addresses and ports' },
  { id: 'relay-addresses', label: 'Grouped inputs: relay IPs and ports' },
  { id: 'window-title', label: 'Shared string: window title' },
  { id: 'server-hot-time', label: 'URL replacement: Hot Time server' },
  { id: 'window-mode', label: 'Hooks: display mode and aspect ratio' },
  { id: 'seven-key-account-level', label: 'Hooks: 7K account level' },
];

type FieldRow = [field: string, description: string, children?: FieldRow[]];

function Reference({ label, rows }: { label: string; rows: FieldRow[] }) {
  return (
    <table className="kvtable patch-reference" aria-label={label}>
      <thead><tr><th scope="col">Field</th><th scope="col">Usage</th></tr></thead>
      <tbody>
        {rows.map(([field, usage, children]) => (
          <Fragment key={field}>
            <tr><td><code>{field}</code></td><td>{usage}</td></tr>
            {children && (
              <tr>
                <td colSpan={2}>
                  <Reference label={`${label}.${field}`} rows={children} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export function ClientPatchGuide() {
  const [example, setExample] = useState(examples[0]!.id);
  const definition = BUILTIN_PATCHES.find((patch) => patch.id === example)!;
  const json = JSON.stringify({
    ...definition,
    id: `custom-${definition.id}`,
    variants: [definition.variants[0]],
  }, null, 2);

  return (
    <>
      <StackHead title="Writing a custom patch" />
      <div className="prose">
        <div>
          A custom patch is a JSON file that defines its controls, the client code to find, and the changes to make.
        </div>
        <ol>
          <li>Find the code you want to change in a disassembler.</li>
          <li>Start with an example below. Change its ID, signatures, and operations, then save it as a .json file.</li>
          <li>Import the JSON and load the client executable. Check Unavailable patches if your patch does not appear.</li>
          <li>Set the patch options, review Changes, and click Save.</li>
        </ol>
      </div>

      <CollapsibleSection title="Definition format">
        <Reference label="Patch definition" rows={[
          ['schemaVersion', 'Required. Set to 1.'],
          ['id', 'Required. Unique patch ID, such as "custom-window-title". Use lowercase letters, digits, and hyphens; start with a letter. Maximum 80 characters.'],
          ['title', 'Required. Patch name shown in the app.'],
          ['description', 'Optional. Help text describing what the patch changes.'],
          ['category', 'Required. Section where the patch appears.'],
          ['group', 'Optional. Subgroup within the category.'],
          ['order', 'Optional. Nonnegative integer for display order; lower numbers appear first. Defaults to 100.'],
          ['inputs', 'Required. Array of controls. See Inputs below.'],
          ['variants', 'Required. Array of client-specific definitions. See Variants below.'],
          ['requires', 'Optional. Array of patch IDs that must also have changes when this patch is changed.'],
          ['conflicts', 'Optional. Array of patch IDs that cannot be changed together with this patch.'],
          ['$schema', 'Optional. Schema URL for editor validation.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Variants" defaultOpen={false}>
        <div className="prose">Each object in <code>variants</code> describes one set of edits. The patcher checks every variant against the loaded executable.</div>
        <Reference label="variants[]" rows={[
          ['client', 'Required. Version information. These fields identify the version badge; operation matches decide whether the patch is available.', [
            ['version', 'Required. Version label, or "*" if unknown.'],
            ['imageBase', 'Optional. Image base from the PE header, as a decimal number.'],
            ['entryPoint', 'Optional. Entry point RVA from the PE header, as a decimal number.'],
            ['anchors', 'Optional. Array of byte sequences used to confirm the version. The badge requires matching imageBase, entryPoint, and all anchors.', [
              ['rva', 'Required. Address of the anchor relative to the image base, as a decimal number.'],
              ['bytes', 'Required. Space-separated hex bytes. Wildcards are not allowed.'],
            ]],
          ]],
          ['defaults', 'Optional. Input defaults for this variant, keyed by input ID, for example { "port": 15010 }. Values read from the executable take precedence.'],
          ['operations', 'Required. Array of edits. Each object uses type: "bytes", "value", "string", or "hook"; their fields are listed below. All operations must match, even when their when condition is false.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Inputs" defaultOpen={false}>
        <div className="prose">Each object in <code>inputs</code> defines one control. Operations refer to it by its <code>id</code>.</div>
        <Reference label="inputs[]" rows={[
          ['id', 'Required. Unique within this patch. Follows the same naming rules as the patch ID.'],
          ['label', 'Required. Text beside the control.'],
          ['control', 'Required. One of "checkbox", "toggle", "radio", "select", "text", "number", "range", or "rows". Range controls show an integer slider and require min and max.'],
          ['default', 'Starting value. Required unless a string operation reads this input from the executable. Use a boolean for checkbox/toggle, a string for text, a number for number/range, or an option value for radio/select. Numeric controls can read numbers stored as strings. Row controls require an array of row objects, usually [].'],
          ['description', 'Optional. Help text below the control.'],
          ['group', 'Optional. Inputs with the same group appear on the same line in array order. Put the IP first, followed by its port inputs.'],
          ['options', 'Required for radio and select. Array of choices:', [
            ['label', 'Required. Text shown for the choice.'],
            ['value', 'Required. String, number, or boolean used when selected. Each choice must have a different value.'],
          ]],
          ['format', 'Optional. "filename", "ipv4", "hostname", "url", "url-origin", or "port". Use "port" with a number control for integers from 1 to 65535. Use "url" for a full HTTP, HTTPS, or MMS URL; "url-origin" accepts only the protocol, host, and optional port.'],
          ['printf', 'Optional for text controls, independent of format. Accepts ASCII text with 32-bit integer placeholders (%d, %i, %u, %o, %x, %X), flags, width, precision, optional l, and literal %%. Format rules check the text with placeholders replaced by 0.', [
            ['integerArgs', 'Required. Exact number of integer placeholders, from 0 to 128.'],
            ['maxLength', 'Required. Maximum expanded length, from 1 to 4096 characters, excluding the null terminator.'],
          ]],
          ['min', 'Optional. Lowest allowed number.'],
          ['max', 'Optional. Highest allowed number.'],
          ['suffix', 'Optional. Text after a range value, such as "%". Does not change the stored number.'],
          ['minFrom', 'Optional. ID of another number input whose value sets the minimum. Inside a row, use a field ID from that row.'],
          ['maxFrom', 'Optional. ID of another number input whose value sets the maximum. Inside a row, use a field ID from that row.'],
          ['maxLength', 'Optional. Maximum text length in characters.'],
          ['visibleWhen', 'Optional. Show the control only when this condition is true. Hidden controls keep their values; use when on an operation to control its edits. See Conditions below.'],
          ['fields', 'Required for rows. Array of input definitions using the fields in this table. Each needs a default, and none may use control: "rows".'],
          ['maxRows', 'Required for rows. Maximum number of rows, from 1 to 128.'],
          ['uniqueBy', 'Optional for rows. Field ID whose value must be different in every row.'],
          ['addLabel', 'Optional for rows. Text on the button that adds a row.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Conditions" defaultOpen={false}>
        <div className="prose">Use a condition object in <code>visibleWhen</code> or <code>when</code>. Choose one form: <code>input</code> with <code>equals</code> or <code>empty</code>, or one of <code>all</code>, <code>any</code>, and <code>not</code>.</div>
        <Reference label="Condition" rows={[
          ['input', 'ID of the input to check. A row field’s visibleWhen can refer to other fields in that row.'],
          ['equals', 'String, number, or boolean to compare with the input. Example: { "input": "enabled", "equals": true }.'],
          ['empty', 'For row inputs. true means no rows; false means at least one row. Example: { "input": "rules", "empty": false }.'],
          ['all', 'Array of conditions that must all be true. Example: { "all": [{ "input": "enabled", "equals": true }, { "input": "rules", "empty": false }] }.'],
          ['any', 'Array of conditions; at least one must be true. Uses the same array format as all.'],
          ['not', 'One condition to invert. Example: { "not": { "input": "enabled", "equals": true } }.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Signatures" defaultOpen={false}>
        <div className="prose">An <code>at</code> object or an entry in <code>references</code> locates bytes in the executable. RVAs are addresses relative to the image base; write addresses and offsets as decimal JSON numbers.</div>
        <Reference label="Locator" rows={[
          ['signature', 'Required. Space-separated hex bytes, with ?? for any byte. Include enough surrounding instructions to distinguish the target. For byte edits, use ?? at positions that change so the signature also matches a patched client.'],
          ['offset', 'Optional. Number of bytes from the start of the signature to the target. Defaults to 0.'],
          ['section', 'Optional. Search only this PE section, for example ".text".'],
          ['rva', 'Optional. Recorded RVA of the signature start. The patcher searches by signature even when this address is supplied.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Byte operations" defaultOpen={false}>
        <div className="prose">Replace bytes at a matched location. The signature and either the original or replacement bytes must identify exactly one location.</div>
        <Reference label="Byte operation" rows={[
          ['type', 'Required. Set to "bytes".'],
          ['at', 'Required. Locator object; see Signatures above.'],
          ['original', 'Required. Expected hex bytes. Use ?? for a byte that varies between clients; that position must also be ?? in replacement.'],
          ['replacement', 'Required. Hex bytes with the same length as original. Each ?? keeps the existing byte. For example, original: "74 ??" and replacement: "EB ??" change the jump opcode and keep its displacement.'],
          ['when', 'Optional. Apply the replacement when this condition is true; otherwise use original. Without when, the replacement is always applied.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Value operations" defaultOpen={false}>
        <div className="prose">Write an input value into a fixed number of bytes. The signature and expected bytes must identify exactly one location.</div>
        <Reference label="Value operation" rows={[
          ['type', 'Required. Set to "value".'],
          ['at', 'Required. Locator object; see Signatures above.'],
          ['original', 'Required. Expected hex bytes, without wildcards. Must contain exactly size bytes. With readCurrent: true, the patcher reads these bytes from the executable instead.'],
          ['value', 'Required. Object identifying the input to write:', [
            ['input', 'Required. Input ID. Example: { "input": "port" }.'],
            ['prefix', 'Optional. Text to prepend to the input.'],
            ['suffix', 'Optional. Text to append to the input.'],
          ]],
          ['encoding', 'Required. "u8", "u16le", or "u32le" for unsigned integers; "f32le" for a float; "ascii" or "utf16le" for terminated text; "hex" for raw bytes. "length8", "length16le", and "length32le" write the text length without its terminator.'],
          ['size', 'Required. Storage size in bytes: 1 for u8/length8, 2 for u16le/length16le, and 4 for u32le/f32le/length32le. Text must fit with its terminator; unused storage is filled with zeros.'],
          ['readCurrent', 'Optional; defaults to false. Set true to read the current numeric value into the control. Supports u8, u16le, u32le, and f32le. The signature must cover the operand and include fixed bytes outside it; prefix and suffix are not allowed.'],
          ['when', 'Optional. Write the value only when this condition is true.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="String operations" defaultOpen={false}>
        <div className="prose">Read a string through the instructions that reference it, then write new text and update those pointers. Check for separate length or copy-size constants in the client code and patch those too if needed.</div>
        <Reference label="String operation" rows={[
          ['type', 'Required. Set to "string".'],
          ['value', 'Required. Object identifying the text input. Use { "input": "server" } with an input whose format is "url" to replace a full URL, including its path, query, and fragment.', [
            ['input', 'Required. Input ID. The control starts with the text read from the executable.'],
            ['prefix', 'Optional. Fixed text before the editable part. It must match the start of the existing string and is kept when saving.'],
            ['suffix', 'Optional. Fixed text after the editable part. It must match the end of the existing string and is kept when saving.'],
            ['part', 'Optional. Set to "origin" to edit only a URL’s protocol, host, and port, keeping its path, query, and fragment. Use input format: "url-origin". Cannot be combined with prefix or suffix.'],
          ]],
          ['references', 'Required. Array of locators for instructions pointing to the string. Each signature must cover the four-byte pointer at offset and surrounding instruction bytes. Pointer bytes are ignored when matching. Every entry must resolve to the same string address; use separate operations for strings stored at different addresses.'],
          ['referenceScope', 'Optional; defaults to "all". "all" requires references to cover every pointer found to this string. "listed" updates only the matched references, useful when other code shares the text.'],
          ['encoding', 'Optional. "ascii" (default), "utf16le", or "euc-kr".'],
          ['original', 'Optional. Reference text for the patch author. The patcher reads the actual string from the matched pointers.'],
          ['sourceRva', 'Optional. Recorded string RVA. The patcher finds the actual address through references.'],
          ['when', 'Optional. Replace the string only when this condition is true.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Native hooks" defaultOpen={false}>
        <div className="prose">Replace whole x86 instructions with a jump to your code. Preserve the registers, flags, stack, and calling convention that the surrounding code expects; replay overwritten instructions where needed.</div>
        <Reference label="Hook operation" rows={[
          ['type', 'Required. Set to "hook".'],
          ['at', 'Required. Locator object. Its signature must cover all overwritten instructions and include fixed bytes outside them.'],
          ['original', 'Required. At least five bytes covering whole instructions. Address operands may use ??. The overwritten instructions must not overlap active PE base relocations.'],
          ['code', 'Required. Space-separated hex bytes of x86 machine code. Reserve space for every fixup.'],
          ['writable', 'Optional; defaults to false. Set true if the added code stores runtime data in its own section. Initialize that data in code and locate it with a codeOffset fixup.'],
          ['fixups', 'Optional. Array of values and addresses to fill into code:', [
            ['offset', 'Required. Byte offset in code where the fixup is written. Fixups must fit inside code and cannot overlap.'],
            ['encoding', 'Required. "u8" or "u32le" for a number, "rel32" for a relative address, or "rows-u32le" for a row input.'],
            ['value', 'Required. Choose one of input, at, originalOffset, continuation, or codeOffset. Use read with at or originalOffset to read an operand.', [
              ['input', 'Input ID. u8 and u32le accept numbers or booleans (false = 0, true = 1); rows-u32le requires a rows input. Example: { "input": "mode" }.'],
              ['at', 'Locator for another address or operand. Without read, uses the matched address and requires encoding: "rel32".'],
              ['originalOffset', 'Byte offset into the overwritten instructions. Requires read; the four-byte operand must fit inside original. Example: { "originalOffset": 2, "read": "u32le" }.'],
              ['read', '"u32le" reads a four-byte unsigned value; "rel32" reads a relative displacement and resolves its destination address.'],
              ['continuation', 'Set to true to target the instruction after original. Requires encoding: "rel32". Example: { "continuation": true }.'],
              ['codeOffset', 'Byte offset of a target inside code. Requires encoding: "rel32". Example: { "codeOffset": 0 }.'],
            ]],
            ['relativeTo', 'Optional for rel32. Byte offset in code used as the base for the displacement. Defaults to offset + 4, the end of the fixup.'],
            ['fields', 'Required for rows-u32le. Array of row field IDs in storage order. Include every field exactly once; each must hold an unsigned 32-bit integer.'],
            ['capacity', 'Required for rows-u32le. Reserved row count, at least the input’s maxRows and at most 128. Reserve 4 + capacity × fields.length × 4 bytes in code: a four-byte row count, then four-byte cells. Unused rows are zeroed.'],
          ]],
          ['when', 'Optional. Install the hook when this condition is true. Setting it false restores the overwritten instructions.'],
        ]} />
      </CollapsibleSection>

      <CollapsibleSection title="Examples">
        <div className="pad form-fields">
          <div className="field">
            <label className="text-normal" htmlFor="patch-example">Example</label>
            <select id="patch-example" value={example} onChange={(event) => setExample(event.target.value)}>
              {examples.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <span className="hint">Each example copies one built-in variant and gives it a custom ID. Check its signatures against your client before importing.</span>
          </div>
          <div className="titlechips">
            <CopyButton value={json} label="Copy JSON" variant="button" />
            <DownloadButton data={json} filename={`custom-${example}.json`} label="Download example" />
          </div>
          <pre className="launchout"><code>{json}</code></pre>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="JSON schema" defaultOpen={false}>
        <div className="pad">
          <pre className="launchout"><code>{schema}</code></pre>
        </div>
      </CollapsibleSection>
    </>
  );
}
