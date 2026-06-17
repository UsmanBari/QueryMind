import os
import json
import asyncio
from backend.services.schema_service import schema_service
from backend.services.llm_service import llm_service
from backend.services.sql_service import sql_service

# Clean up db first to prevent already exists
db_path = "databases/schema/empdept.db"
if os.path.exists(db_path):
    os.remove(db_path)

sql = """
CREATE TABLE DEPT (
  DEPTNO INT PRIMARY KEY,
  DNAME VARCHAR(14),
  LOC VARCHAR(13)
);

CREATE TABLE EMP (
  EMPNO INT PRIMARY KEY,
  ENAME VARCHAR(10),
  JOB VARCHAR(9),
  MGR INT,
  HIREDATE DATETIME,
  SAL DECIMAL(7,2),
  COMM DECIMAL(7,2),
  DEPTNO INT,
  CONSTRAINT FK_DEPTNO FOREIGN KEY (DEPTNO) REFERENCES DEPT(DEPTNO),
  CONSTRAINT FK_MGR FOREIGN KEY (MGR) REFERENCES EMP(EMPNO)
);

CREATE TABLE SALGRADE (
  GRADE INT PRIMARY KEY,
  LOSAL INT,
  HISAL INT
);

INSERT INTO DEPT VALUES (10, 'ACCOUNTING', 'NEW YORK');
INSERT INTO DEPT VALUES (20, 'RESEARCH',   'DALLAS');
INSERT INTO DEPT VALUES (30, 'SALES',      'CHICAGO');
INSERT INTO DEPT VALUES (40, 'OPERATIONS', 'BOSTON');

INSERT INTO EMP VALUES (7839, 'KING',   'PRESIDENT', NULL, '1981-11-17', 5000, NULL, 10);
INSERT INTO EMP VALUES (7698, 'BLAKE',  'MANAGER',   7839, '1981-05-01', 2850, NULL, 30);
INSERT INTO EMP VALUES (7782, 'CLARK',  'MANAGER',   7839, '1981-06-09', 2450, NULL, 10);
INSERT INTO EMP VALUES (7566, 'JONES',  'MANAGER',   7839, '1981-04-02', 2975, NULL, 20);
INSERT INTO EMP VALUES (7654, 'MARTIN', 'SALESMAN',  7698, '1981-09-28', 1250, 1400, 30);
INSERT INTO EMP VALUES (7499, 'ALLEN',  'SALESMAN',  7698, '1981-02-20', 1600, 300,  30);
INSERT INTO EMP VALUES (7844, 'TURNER', 'SALESMAN',  7698, '1981-09-08', 1500, 0,    30);
INSERT INTO EMP VALUES (7900, 'JAMES',  'CLERK',     7698, '1981-12-03', 950,  NULL, 30);
INSERT INTO EMP VALUES (7521, 'WARD',   'SALESMAN',  7698, '1981-02-22', 1250, 500,  30);
INSERT INTO EMP VALUES (7902, 'FORD',   'ANALYST',   7566, '1981-12-03', 3000, NULL, 20);
INSERT INTO EMP VALUES (7369, 'SMITH',  'CLERK',     7902, '1980-12-17', 800,  NULL, 20);
INSERT INTO EMP VALUES (7788, 'SCOTT',  'ANALYST',   7566, '1982-12-09', 3000, NULL, 20);
INSERT INTO EMP VALUES (7876, 'ADAMS',  'CLERK',     7788, '1983-01-12', 1100, NULL, 20);
INSERT INTO EMP VALUES (7934, 'MILLER', 'CLERK',     7782, '1982-01-23', 1300, NULL, 10);

INSERT INTO SALGRADE VALUES (1, 700, 1200);
INSERT INTO SALGRADE VALUES (2, 1201, 1400);
INSERT INTO SALGRADE VALUES (3, 1401, 2000);
INSERT INTO SALGRADE VALUES (4, 2001, 3000);
INSERT INTO SALGRADE VALUES (5, 3001, 9999);
"""

def run_tests():
    print("Testing register_schema_db...")
    info = schema_service.register_schema_db("empdept", schema_sql_content=sql)
    print("Relationships:")
    for rel in info['relationships']:
        print(f" - {rel['from_table']}.{rel['from_column']} -> {rel['to_table']}.{rel['to_column']}")
    
    questions = [
        "What are the names of employees in the SALES department?",
        "Which employees earn a grade 4 salary?",
        "Who is SMITH's manager?"
    ]
    
    for q in questions:
        print(f"\\nQ: {q}")
        res_llm = llm_service.generate_sql_schema(q, info)
        sql_query = res_llm["sql"]
        print(f"SQL: {sql_query}")
        try:
            res = sql_service.execute_query("empdept", sql_query, mode="schema")
            print(f"Results: {res['rows']}")
        except Exception as e:
            print(f"Error executing: {e}")

if __name__ == '__main__':
    run_tests()
