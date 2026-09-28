"""Educational checks, with a fresh user namespace per case; not a security sandbox."""
import ast
import contextlib
import copy
import io
import json
import math
import traceback

class _LimitedOutput(io.StringIO):
    def write(self, value):
        super().write(str(value)[:max(0, 5000 - self.tell())])
        return len(value)

def _execute(code, tree=None):
    output = _LimitedOutput()
    namespace = {"__name__": "__main__"}
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
        exec(compile(tree if tree is not None else code, '<你的程式>', 'exec'), namespace)
    return output.getvalue(), namespace

def _equal(actual, expected):
    if isinstance(expected, (float, int)) and not isinstance(expected, bool):
        return isinstance(actual, (float, int)) and not isinstance(actual, bool) and math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9)
    if isinstance(expected, (list, tuple)):
        return type(actual) is type(expected) and len(actual) == len(expected) and all(_equal(a, e) for a, e in zip(actual, expected))
    if isinstance(expected, dict):
        return type(actual) is dict and actual.keys() == expected.keys() and all(_equal(actual[k], v) for k, v in expected.items())
    return type(actual) is type(expected) and actual == expected

def _study_evaluate(code, spec_json):
    spec = json.loads(spec_json) if spec_json else None
    report = {"output": "", "error": "", "passed": False, "checks": []}
    try:
        tree = ast.parse(code)
        output, namespace = _execute(code)
        report['output'] = output
        if not spec:
            return json.dumps(report, ensure_ascii=False)
        kinds = {type(n).__name__ for n in ast.walk(tree)}
        for kind in spec.get('required', []):
            report['checks'].append({"label": '使用本題概念：' + kind, "passed": kind in kinds})
        if spec.get('requiredAny'):
            report['checks'].append({"label": '使用迴圈（for 或 while）', "passed": bool(kinds.intersection(spec['requiredAny']))})
        kind = spec['kind']
        if kind in ('output', 'state'):
            report['checks'].append({"label": '輸出符合本題要求', "passed": output.strip() == spec['expected']})
            for name, expected in spec.get('variables', {}).items():
                report['checks'].append({"label": name + ' 的實際內容符合要求', "passed": _equal(namespace.get(name), expected)})
        elif kind == 'function':
            name = spec['name']
            if not callable(namespace.get(name)):
                report['checks'].append({"label": '需要可呼叫的 ' + name + ' 函式；只印出答案不算完成', "passed": False})
            else:
                for case in spec['cases']:
                    _, fresh = _execute(code)
                    repeat = case.get('repeat', 1)
                    if type(repeat) is not int or not 1 <= repeat <= 3:
                        raise ValueError('重複檢查次數須為1到3')
                    for attempt in range(repeat):
                        arguments = copy.deepcopy(case['args'])
                        with contextlib.redirect_stdout(_LimitedOutput()):
                            actual = fresh[name](*arguments)
                            if spec.get('generator'):
                                actual = list(actual)
                        expected = tuple(case['expected']) if case.get('tuple') else case['expected']
                        prefix = ('同一環境第' + str(attempt + 1) + '次呼叫：') if repeat > 1 else ''
                        report['checks'].append({"label": prefix + name + '(' + ', '.join(map(str, case['args'])) + ') 應回傳 ' + repr(expected) + '；實際 ' + repr(actual)[:150], "passed": _equal(actual, expected)})
                        if spec.get('preservesArgs'):
                            report['checks'].append({'label': '保留原輸入資料', 'passed': arguments == case['args']})
                        if 'argsAfter' in case:
                            report['checks'].append({'label': '呼叫後的原輸入資料符合修改契約', 'passed': _equal(arguments, case['argsAfter'])})
        elif kind == 'class':
            name = spec['name']
            if spec.get('baseClass'):
                base = namespace.get(spec['baseClass'])
                candidate = namespace.get(name)
                report['checks'].append({'label': name + ' 是 ' + spec['baseClass'] + ' 的獨立子類', 'passed': isinstance(base, type) and isinstance(candidate, type) and candidate is not base and issubclass(candidate, base)})
            if not isinstance(namespace.get(name), type):
                report['checks'].append({'label': '需要定義 ' + name + ' 類別', 'passed': False})
            else:
                for case in spec['cases']:
                    _, fresh = _execute(code)
                    with contextlib.redirect_stdout(_LimitedOutput()):
                        objects = [fresh[name](*args) for args in case['construct']]
                        for action in case['actions']:
                            arguments = [objects[arg['$object']] if isinstance(arg, dict) and set(arg) == {'$object'} else copy.deepcopy(arg) for arg in action['args']]
                            returned = getattr(objects[action['object']], action['method'])(*arguments)
                            if 'newObject' in action:
                                receiver = objects[action['object']]
                                expected_fields = action['newObject']
                                valid = type(returned) is type(receiver) and all(returned is not obj for obj in objects)
                                valid = valid and all(hasattr(returned, key) and _equal(getattr(returned, key), value) for key, value in expected_fields.items())
                                report['checks'].append({'label': case['label'] + ' · ' + action['method'] + ' 回傳獨立的同類物件，欄位應為 ' + repr(expected_fields), 'passed': valid})
                            if 'expected' in action:
                                expected = tuple(action['expected']) if action.get('tuple') else action['expected']
                                report['checks'].append({'label': case['label'] + ' · ' + action['method'] + ' 回傳：預期 ' + repr(expected) + '；實際 ' + repr(returned)[:150], 'passed': _equal(returned, expected)})
                        if spec.get('attribute'):
                            actual = [getattr(obj, spec['attribute']) for obj in objects]
                            report['checks'].append({'label': case['label'] + '：預期 ' + repr(case['expected']) + '；實際 ' + repr(actual)[:150], 'passed': _equal(actual, case['expected'])})
        elif kind == 'scriptCases':
            name = spec['input']
            for case in spec['cases']:
                case_tree = ast.parse(code)
                target = next((n for n in case_tree.body if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) and n.targets[0].id == name), None)
                if target is None:
                    report['checks'].append({"label": '請保留頂層 ' + name + ' = ...，方便更換測試資料', "passed": False})
                    break
                target.value = ast.parse(repr(case['value']), mode='eval').body
                ast.fix_missing_locations(case_tree)
                actual, _ = _execute(code, case_tree)
                report['checks'].append({"label": name + ' = ' + repr(case['value']) + ' → 應輸出 ' + case['expected'] + '；實際 ' + actual.strip()[:150], "passed": actual.strip() == case['expected']})
        else:
            raise ValueError('未知的檢查方式')
        report['passed'] = bool(report['checks']) and all(x['passed'] for x in report['checks'])
    except BaseException:
        report['error'] = traceback.format_exc(limit=6)[-5000:]
    return json.dumps(report, ensure_ascii=False)
