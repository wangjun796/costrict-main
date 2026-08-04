# ���ؿ��������¼

> ���ļ���¼���ض��ο��������е����иĶ�������׷�ٺͻ��ݡ�
> ÿ���޸Ķ�Ӧ�ڴ��ļ��м�¼����ʽ��ѭ�·��淶��

---

## ��¼�淶

ÿ����¼Ӧ��������Ҫ�أ�

- **����**���޸����ڣ�YYYY-MM-DD��
- **�ļ�**���޸ĵ��ļ�·�����������Ŀ��Ŀ¼��
- **�Ķ�����**��`�޸�` / `����` / `ɾ��`
- **�Ķ�����**���������ʲô
- **�Ķ�ԭ��**��Ϊʲô������Ķ�
- **Ӱ�췶Χ**���øĶ�����Ӱ��Ĺ���

---

## 2026-08-03

### 1. package.json �� �ſ� Node.js �汾Ҫ��

- **�ļ�**��`package.json`
- **�Ķ�����**���޸�
- **�Ķ�����**��`engines.node` �� `"20.19.2"` ��Ϊ `">=20.19.2"`
- **�Ķ�ԭ��**�����ػ���ʹ�� Node.js v22.19.0���ϸ�汾ƥ�䵼�� `pnpm install` ʱ���� `Unsupported engine` ����
- **Ӱ�췶Χ**���޹���Ӱ�죬�������汾��龯��

### 2. scripts/generate-review-builtin.mjs �� �޸� review �ֿ��ַ����¡Э��

- **�ļ�**��`scripts/generate-review-builtin.mjs`
- **�Ķ�����**���޸�
- **�Ķ�����**��
    - `REPO` �� `"zgsm-ai/costrict-review"` ��Ϊ `"wangjun796/costrict"`
    - `CLONE_URL` �� `git@github.com:${REPO}.git`��SSH Э�飩��Ϊ `https://github.com/${REPO}.git`��HTTPS Э�飩
- **�Ķ�ԭ��**��
    - ԭ�ֿ� `zgsm-ai/costrict-review` �޷����ʣ�SSH ��Ȩ�� + HTTPS �ֿⲻ���ڣ�
    - ���ػ���δ���� GitHub SSH Key������ HTTPS Э�������֤����
- **Ӱ�췶Χ**��`pnpm bundle`��`pnpm vsix` ���������е� review skills ���ػ���

### 3. scripts/generate-review-builtin.mjs �� ����Զ�ֿ̲ⲻ�ɴ�ʱ�Ľ����߼�

- **�ļ�**��`scripts/generate-review-builtin.mjs`
- **�Ķ�����**���޸�
- **�Ķ�����**��
    - ԭ�߼���`lsRemoteSha()` ���� null ʱֱ�� `throw Error` �˳������¹����ж�
    - ���߼���
        1. Զ�̿ɷ��� �� ������¡���أ����䣩
        2. Զ�̲��ɴ� + �б��ػ��� �� ʹ�û�����Դ�����䣩
        3. **Զ�̲��ɴ� + �޻��� �� ������С�� `index.json`���� skills �б�����`process.exit(0)` �����˳������жϹ���**
- **�Ķ�ԭ��**�����粻�ȶ���ֿⲻ�ɷ���ʱ����Ӧ������� VSIX ������̡�Review skills �Ǹ��ӹ��ܣ�������ʱ��ӦӰ����Ĺ��ܹ���
- **Ӱ�췶Χ**��`pnpm bundle`��`pnpm vsix` �������̡�Review skills ������Զ�̲��ɴ����޻���ʱ������

### 4. src/bundled-skills/ �� �������� review skills���ƹ�Զ�����أ�

- **�ļ�**��`src/bundled-skills/`������Ŀ¼��
- **�Ķ�����**������
- **�Ķ�����**��
    - ���� `index.json` �����嵥������ review + security-review �������ܣ�
    - ���� `en/review/SKILL.md`��Ӣ�Ĵ������ģ�壩
    - ���� `en/security-review/SKILL.md` + `references/`��Ӣ�İ�ȫ���ģ�弰�ο��ļ���Դ�� `zgsm-ai/security-review-skill` �����ֿ⣩
    - ���� `zh-CN/review/SKILL.md`�����Ĵ������ģ�壩
    - ���� `zh-CN/security-review/SKILL.md` + `references/`�����İ�ȫ���ģ�弰�ο��ļ���
- **�Ķ�ԭ��**��
    - ԭʼ review skills ��Դ `zgsm-ai/costrict-review` ��˽�вֿ⣬�ⲿ�޷�����
    - ���ֿ���κη�֧�������� skills �ļ������� commit `987b288` Ǩ�Ƶ�����˽�вֿ⣩
    - ͨ�����ش��������� skills �ļ��������ƹ�Զ����������
- **Ӱ�췶Χ**��`pnpm bundle`��`pnpm vsix` �������̡�����ʱ�ű���⵽���� skills �������Զ�����Զ������

### 5. scripts/generate-review-builtin.mjs �� ���ӱ��� skills ����߼�

- **�ļ�**��`scripts/generate-review-builtin.mjs`
- **�Ķ�����**���޸�
- **�Ķ�����**��
    - ���� `hasCompleteLocalSkills()` ��������� `bundled-skills/` �Ƿ���������ı��� skills��index.json + ���� locale �� ���� skill �� SKILL.md��
    - ���� `REQUIRED_SKILLS` �� `REQUIRED_LOCALES` ��������
    - `main()` ������ͷ���ӿ���·����������� skills ������ֱ������Զ�����أ�ʹ�ñ����ļ�
    - ����ԭ�е�Զ�����غͽ����߼���Ϊ��
- **�Ķ�ԭ��**����ϵ� 4 ��Ķ���ʹ�����ű�����ʹ�ñ��� skills�����ڱ��ز�����ʱ�ų���Զ������
- **Ӱ�췶Χ**��`pnpm bundle`��`pnpm vsix` �������̡����� skills ����ʱ�����ٶȸ��죬�Ҳ���������
