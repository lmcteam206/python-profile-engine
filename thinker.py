import sys
import json
import base64
import dis
import io

class ChronoThinker:
    def __init__(self, full_code):
        self.prev_locals = {}
        self.history = []
        self.bytecode_map = self.disassemble_code(full_code)

    def disassemble_code(self, source):
        # Map line numbers to corresponding compiled Python assembly instruction blocks
        mapping = {}
        try:
            compiled = compile(source, '<string>', 'exec')
            # Look at instructions inside main block and any methods
            all_constants = [compiled] + list(compiled.co_consts)
            for item in all_constants:
                if hasattr(item, 'co_code'):
                    capture_buffer = io.StringIO()
                    dis.dis(item, file=capture_buffer)
                    capture_buffer.seek(0)
                    
                    current_line = None
                    for line in capture_buffer:
                        parts = line.split()
                        if parts and parts[0].isdigit():
                            current_line = int(parts[0])
                            mapping[current_line] = ""
                        if current_line is not None:
                            mapping[current_line] += line
        except Exception:
            pass
        return mapping

    def trace_lines(self, frame, event, arg):
        if event not in ('line', 'call'):
            return self.trace_lines
        
        line_no = frame.f_lineno
        func_name = frame.f_code.co_name
        
        if func_name == '<module>':
            return self.trace_lines

        current_locals = {k: str(v) for k, v in frame.f_locals.items() if not k.startswith('__')}
        thought = "Evaluating line logic operations..."
        
        if current_locals != self.prev_locals and current_locals:
            for var, val in current_locals.items():
                if "object at" in val or "<function" in val:
                    continue
                if var not in self.prev_locals:
                    thought = f"Memory Assignment: Set '{var}' = {val}"
                    break
                elif self.prev_locals[var] != val:
                    thought = f"State Change: Mutated '{var}' to {val}"
                    break
        elif event == 'call':
            thought = f"Allocated call frame environment layer for {func_name}()"

        self.history.append({
            "line": line_no,
            "function": func_name,
            "thought": thought,
            "locals": current_locals.copy(),
            "bytecode": self.bytecode_map.get(line_no, "").strip()
        })

        self.prev_locals = current_locals.copy()
        return self.trace_lines

    def run(self, code_string):
        sys.settrace(self.trace_lines)
        try:
            # FORCE the environment name to match __main__ explicitly
            sandbox = {"__name__": "__main__"}
            exec(code_string, sandbox, sandbox)
        except Exception as e:
            self.history.append({"line": 1, "function": "error", "thought": f"Runtime Crash: {str(e)}", "locals": {}, "bytecode": ""})
        finally:
            sys.settrace(None)
        print(json.dumps(self.history), flush=True)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        decoded_bytes = base64.b64decode(sys.argv[1])
        target_code = decoded_bytes.decode('utf-8')
        thinker = ChronoThinker(target_code)
        thinker.run(target_code)
