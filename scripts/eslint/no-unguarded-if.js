module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow unguarded critical if statements without logging or metrics',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    return {
      IfStatement(node) {
        // naive check: if statement without a console.log or metrics call in consequent block, report
        const consequent = node.consequent;
        if (consequent && consequent.body && Array.isArray(consequent.body)) {
          const hasLog = consequent.body.some((statement) => {
            return statement.type === 'ExpressionStatement' && statement.expression && statement.expression.callee && statement.expression.callee.object && statement.expression.callee.object.name === 'console';
          });
          if (!hasLog) {
            context.report({ node, message: 'Unguarded if: consider adding logging or metrics here.' });
          }
        }
      },
    };
  },
};
