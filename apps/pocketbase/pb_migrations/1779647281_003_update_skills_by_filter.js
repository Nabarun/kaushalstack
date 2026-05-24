/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let records;
  try {
    records = app.findRecordsByFilter("skills", "name='Sentiment Analysis'");
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("No records found, skipping");
      return;
    }
    throw e;
  }
  
  for (const record of records) {
    record.set("description", "# Sentiment Analysis & NLP\n\n## Overview\nSentiment analysis uses Natural Language Processing (NLP) to detect and interpret emotions, opinions, and attitudes in text data. It's essential for understanding customer perception and brand health.\n\n## NLP Basics\n\n### Natural Language Processing\n- Text preprocessing (tokenization, stemming, lemmatization)\n- Part-of-speech tagging\n- Named entity recognition\n- Dependency parsing\n- Semantic analysis\n- Language models\n\n### Text Representation\n- Bag of words\n- TF-IDF (Term Frequency-Inverse Document Frequency)\n- Word embeddings (Word2Vec, GloVe)\n- Contextual embeddings (BERT, GPT)\n- Sentence embeddings\n\n## Emotion Detection\n\n### Sentiment Categories\n- Positive sentiment\n- Negative sentiment\n- Neutral sentiment\n- Mixed sentiment\n- Emotion-specific (joy, anger, fear, sadness)\n\n### Intensity Levels\n- Strong positive\n- Mild positive\n- Neutral\n- Mild negative\n- Strong negative\n\n### Aspect-Based Sentiment\n- Product features\n- Service quality\n- Price perception\n- Customer service\n- Delivery experience\n\n## Real-World Applications\n\n### Brand Monitoring\n- Social media sentiment tracking\n- Customer perception analysis\n- Crisis detection\n- Reputation management\n- Competitive comparison\n- Trend identification\n\n### Customer Feedback Analysis\n- Review analysis\n- Survey response analysis\n- Support ticket sentiment\n- Product feedback\n- Feature requests\n- Complaint categorization\n\n### Market Research\n- Consumer opinion tracking\n- Campaign effectiveness\n- Product launch reception\n- Competitor perception\n- Industry sentiment\n- Emerging issues\n\n## Tools & Technologies\n\n### Python Libraries\n- NLTK for NLP tasks\n- TextBlob for simple sentiment\n- VADER for social media\n- spaCy for advanced NLP\n- Transformers for BERT/GPT\n- Scikit-learn for classification\n\n### Specialized Tools\n- IBM Watson Natural Language Understanding\n- Google Cloud Natural Language API\n- AWS Comprehend\n- Microsoft Text Analytics\n- MonkeyLearn\n- Brandwatch\n\n### Social Listening Platforms\n- Sprout Social\n- Hootsuite Insights\n- Mention\n- Talkwalker\n- Brandwatch\n- Crimson Hexagon\n\n## Challenges\n\n### Context & Nuance\n- Sarcasm detection\n- Irony interpretation\n- Cultural differences\n- Slang and colloquialisms\n- Negation handling\n- Domain-specific language\n\n### Solutions\n- Use advanced models (BERT, GPT)\n- Combine with human review\n- Domain-specific training\n- Contextual analysis\n- Ensemble methods\n- Regular model updates\n\n## Analysis Framework\n\n### Key Metrics\n- Sentiment distribution\n- Sentiment trend over time\n- Sentiment by topic\n- Sentiment by source\n- Emotion breakdown\n- Intensity distribution\n\n### Interpretation\n- Identify key drivers\n- Understand context\n- Recognize patterns\n- Detect anomalies\n- Compare segments\n- Track changes\n\n## Implementation Steps\n\n### Data Collection\n- Social media monitoring\n- Review aggregation\n- Survey responses\n- Customer feedback\n- News articles\n- Forum discussions\n\n### Processing\n- Data cleaning\n- Text normalization\n- Feature extraction\n- Model selection\n- Training and validation\n- Testing\n\n### Analysis\n- Sentiment classification\n- Emotion detection\n- Aspect extraction\n- Trend analysis\n- Visualization\n- Reporting\n\n## Learning Resources\n- \"Natural Language Processing with Python\" by Steven Bird\n- \"Speech and Language Processing\" by Jurafsky & Martin\n- Hugging Face NLP course\n- Fast.ai NLP course\n- Kaggle sentiment analysis competitions\n- Research papers on arXiv\n\n## Best Practices\n- Start with clear objectives\n- Understand your data\n- Choose appropriate models\n- Validate results manually\n- Consider context\n- Update models regularly\n- Monitor performance\n- Document methodology\n- Combine with human insight\n- Maintain ethical standards");
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
