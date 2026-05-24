/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Python'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Python Programming\n\n## Overview\nPython is a high-level, interpreted programming language known for its simplicity, readability, and versatility. It's widely used in data science, machine learning, web development, and automation.\n\n## Core Characteristics\n\n### Interpreted Language\n- Code executed line-by-line by interpreter\n- No compilation step required\n- Rapid development and testing\n- Dynamic typing system\n\n### Readability & Simplicity\n- Clean, intuitive syntax\n- Minimal boilerplate code\n- Whitespace-based indentation\n- Beginner-friendly learning curve\n\n## Data Science Ecosystem\n\n### NumPy\n- Numerical computing library\n- N-dimensional arrays and matrices\n- Mathematical and statistical functions\n- Foundation for other data science libraries\n\n### Pandas\n- Data manipulation and analysis\n- DataFrames for tabular data\n- Data cleaning and transformation\n- Time series analysis\n\n### Scikit-learn\n- Machine learning algorithms\n- Classification, regression, clustering\n- Model evaluation and validation\n- Feature engineering tools\n\n## Machine Learning\n- TensorFlow and PyTorch for deep learning\n- Natural language processing with NLTK\n- Computer vision with OpenCV\n- Jupyter notebooks for interactive development\n\n## Web Frameworks\n\n### Django\n- Full-featured web framework\n- Built-in ORM and admin panel\n- Authentication and authorization\n- Scalable for large projects\n\n### Flask\n- Lightweight microframework\n- Flexible and modular\n- Minimal dependencies\n- Perfect for APIs and small projects\n\n## Real-World Use Cases\n\n### Automation\n- System administration scripts\n- File and data processing\n- Web scraping\n- Task scheduling\n\n### Artificial Intelligence\n- Machine learning model development\n- Natural language processing\n- Computer vision applications\n- Predictive analytics\n\n### Data Analysis\n- Business intelligence\n- Statistical analysis\n- Data visualization\n- Report generation\n\n## Why Python is Popular\n- Large, active community\n- Extensive library ecosystem\n- Versatility across domains\n- Strong industry adoption\n- Excellent documentation\n\n## Learning Resources\n- Python official documentation\n- \"Python Crash Course\" by Eric Matthes\n- DataCamp and Coursera courses\n- Real Python tutorials\n- LeetCode for algorithm practice\n\n## Best Practices\n- Follow PEP 8 style guide\n- Use virtual environments\n- Write comprehensive docstrings\n- Implement unit tests with pytest\n- Use type hints for clarity\n- Keep functions small and focused\n- Use linting tools (pylint, flake8)\n- Document code thoroughly");
    try {
      app.save(record);
    } catch (e) {
      if (e.message.includes("Value must be unique")) {
        console.log("Record with unique value already exists, skipping");
      } else {
        throw e;
      }
    }
  }
}, (app) => {
  // Rollback: original values not stored, manual restore needed
})
